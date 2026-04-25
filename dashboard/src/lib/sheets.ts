import { SHEET_ID, TABS } from './config';
import type {
  Asistencia,
  ConfUser,
  Empleado,
  EmpleadoEstado,
  Pago,
  Descanso,
  DescansoTipo,
  Falta,
  Extra,
  Puntualidad,
} from './types';

// ────────────────────────────────────────────────────────────────────────────
// Cliente gviz
// ────────────────────────────────────────────────────────────────────────────
// gviz devuelve:  /*O_o*/\ngoogle.visualization.Query.setResponse({ ... });
// Extraemos el JSON entre los paréntesis.

interface GvizCol {
  id: string;
  label: string;
  type: string;
}
interface GvizCell {
  v: unknown;
  f?: string;
}
interface GvizRow {
  c: (GvizCell | null)[];
}
interface GvizTable {
  cols: GvizCol[];
  rows: GvizRow[];
  parsedNumHeaders?: number;
}
interface GvizResponse {
  version: string;
  status: string;
  table: GvizTable;
  errors?: { message: string; detailed_message?: string }[];
}

function parseGvizPayload(text: string): GvizResponse {
  // Patrón típico: "/*O_o*/\ngoogle.visualization.Query.setResponse(<json>);"
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end < 0) {
    throw new Error('gviz: formato inesperado');
  }
  const json = text.slice(start + 1, end);
  return JSON.parse(json) as GvizResponse;
}

export async function fetchTab(sheetName: string, headers = 1): Promise<{
  headerRows: string[][];
  data: Record<string, unknown>[];
  rawRows: (GvizCell | null)[][];
  cols: GvizCol[];
}> {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set('tqx', 'out:json');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('headers', String(headers));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`gviz HTTP ${res.status} al leer "${sheetName}"`);
  const text = await res.text();
  const parsed = parseGvizPayload(text);

  if (parsed.status !== 'ok') {
    const msg = parsed.errors?.[0]?.message ?? 'gviz status != ok';
    throw new Error(`gviz "${sheetName}": ${msg}`);
  }

  const cols = parsed.table.cols;
  const rawRows = parsed.table.rows.map((r) => r.c ?? []);
  const headerRows: string[][] = []; // gviz ya interpretó los headers; se dejan vacíos

  // Convertimos cada fila a un objeto {label: value} usando el label de columna.
  const data = parsed.table.rows.map((r) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, i) => {
      const cell = r.c?.[i];
      const key = col.label?.trim() || col.id;
      obj[key] = cell?.v ?? null;
    });
    return obj;
  });

  return { headerRows, data, rawRows, cols };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers de parseo
// ────────────────────────────────────────────────────────────────────────────

/** Parsea fechas de gviz, que vienen como "Date(2026,3,15)" o como string ISO. */
export function parseGvizDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    // Formato "Date(yyyy,m,d[,h,m,s])". Mes es 0-indexed.
    const m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(v);
    if (m) {
      const [, y, mo, d, h, mi, s] = m;
      return new Date(
        Number(y),
        Number(mo),
        Number(d),
        Number(h ?? 0),
        Number(mi ?? 0),
        Number(s ?? 0),
      );
    }
    // Intento ISO
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t);
  }
  if (typeof v === 'number') {
    // epoch ms
    return new Date(v);
  }
  return null;
}

function numOrZero(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(',', '.');
    const n = Number(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

// ────────────────────────────────────────────────────────────────────────────
// Wrappers tipados por tab
// ────────────────────────────────────────────────────────────────────────────

/**
 * EMPLEADOS es especial: dos tablas lado a lado separadas por una columna vacía.
 * Columnas izquierda: ID, NOMBRE, SUELDO_DIARIO, ESTADO, SUELDO_FDS, DEUDA_INICIAL
 * (vacío)
 * Columnas derecha:  ID, NOMBRE, SUELDO_DIARIO, ESTADO, SUELDO_FDS, DEUDA_INICIAL
 * La izquierda suele ser ACTIVOS y la derecha PASIVOS pero no se puede asumir:
 * leemos el ESTADO explícito en cada fila.
 */
export async function fetchEmpleados(): Promise<Empleado[]> {
  const { cols, rawRows } = await fetchTab(TABS.empleados, 1);

  // La hoja tiene dos tablas lado a lado (ACTIVOS | PASIVOS). Ambas empiezan
  // con "ID". Detectamos la segunda tabla buscando la segunda columna cuyo
  // label sea "ID". Las columnas entre el fin del primer bloque (última col
  // con label conocido) y esa segunda "ID" se consideran extras del bloque
  // izquierdo (ej. una nueva columna "sueldo" mensual).
  const KNOWN_LABELS = new Set([
    'ID', 'NOMBRE', 'SUELDO_DIARIO', 'ESTADO', 'SUELDO_FDS', 'DEUDA_INICIAL',
  ]);
  const idIdxs: number[] = [];
  cols.forEach((c, i) => {
    if ((c.label || '').trim().toUpperCase() === 'ID') idIdxs.push(i);
  });

  let leftStart = 0;
  let leftEnd = cols.length; // exclusive
  let rightStart = -1;
  let rightEnd = -1;

  if (idIdxs.length >= 2) {
    rightStart = idIdxs[1];
    leftEnd = rightStart; // el bloque izquierdo incluye hasta (sin) la segunda ID
    rightEnd = cols.length;
  }

  const out: Empleado[] = [];

  const buildFromBlock = (start: number, end: number, includeExtras: boolean) => {
    // Índice por label dentro del bloque (solo labels "conocidos")
    const colIdx: Record<string, number> = {};
    // Columnas extra (no reconocidas) dentro del bloque — ej. "sueldo" mensual
    const extras: number[] = [];
    for (let i = start; i < end; i++) {
      const label = (cols[i].label || '').trim().toUpperCase();
      if (!label) continue;
      if (KNOWN_LABELS.has(label)) {
        if (colIdx[label] === undefined) colIdx[label] = i;
      } else if (includeExtras) {
        extras.push(i);
      }
    }

    for (const row of rawRows) {
      const id = str(row[colIdx.ID]?.v ?? '').trim();
      const nombre = str(row[colIdx.NOMBRE]?.v ?? '').trim();
      if (!id || !nombre) continue;
      const estadoRaw = str(row[colIdx.ESTADO]?.v ?? '').toUpperCase().trim();
      const estado: EmpleadoEstado = estadoRaw === 'ACTIVO' ? 'ACTIVO' : 'PASIVO';
      // Sueldo mensual: tomar la primera columna extra con valor numérico
      let sueldoMensual = 0;
      for (const i of extras) {
        const v = numOrZero(row[i]?.v);
        if (v > 0) { sueldoMensual = v; break; }
      }
      out.push({
        id,
        nombre,
        sueldoDiario: numOrZero(row[colIdx.SUELDO_DIARIO]?.v),
        estado,
        sueldoFds: numOrZero(row[colIdx.SUELDO_FDS]?.v),
        deudaInicial: numOrZero(row[colIdx.DEUDA_INICIAL]?.v),
        sueldoMensual,
      });
    }
  };

  buildFromBlock(leftStart, leftEnd, true);
  if (rightStart >= 0) buildFromBlock(rightStart, rightEnd, false);

  // De-duplicar por id (si alguien aparece en ambos bloques)
  const seen = new Map<string, Empleado>();
  for (const e of out) {
    if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return Array.from(seen.values());
}

export async function fetchPagos(): Promise<Pago[]> {
  const { data } = await fetchTab(TABS.pagos, 1);
  const out: Pago[] = [];
  for (const row of data) {
    const id = str(row['ID']).trim();
    if (!id) continue;
    const fecha = parseGvizDate(row['FECHA']);
    if (!fecha) continue;
    const rowId = str(row['ROW_ID']).trim();
    out.push({
      id,
      nombre: str(row['NOMBRE']).trim(),
      fecha,
      hora: str(row['HORA']).trim(),
      tipoPago: str(row['TIPO_PAGO']).trim(),
      monto: numOrZero(row['MONTO']),
      timestamp: parseGvizDate(row['TIMESTAMP']),
      rowId: rowId || undefined,
    });
  }
  // Orden descendente por fecha
  out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return out;
}

/**
 * Lectura posicional para tabs escritas por Apps Script. Usa headers=0 para
 * que gviz no interprete nada como header. Cada fila se lee por índice fijo.
 * Funciona con o sin fila de header en la tab.
 */
async function fetchPositional(sheetName: string): Promise<unknown[][]> {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set('tqx', 'out:json');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('headers', '0');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`gviz HTTP ${res.status} al leer "${sheetName}"`);
  const text = await res.text();
  const startP = text.indexOf('(');
  const endP = text.lastIndexOf(')');
  const parsed = JSON.parse(text.slice(startP + 1, endP));
  if (parsed.status !== 'ok') {
    const msg = parsed.errors?.[0]?.message ?? 'gviz status != ok';
    throw new Error(`gviz "${sheetName}": ${msg}`);
  }
  return parsed.table.rows.map((r: { c: ({ v: unknown } | null)[] }) =>
    r.c.map((cell) => cell?.v ?? null),
  );
}

/**
 * DESCANSOS — columnas fijas: ROW_ID | ID | NOMBRE | FECHA | TIPO | MOTIVO |
 * CREADO_EN | ACTUALIZADO_EN.
 */
export async function fetchDescansos(): Promise<Descanso[]> {
  let rows: unknown[][];
  try {
    rows = await fetchPositional(TABS.descansos);
  } catch {
    return [];
  }
  const allowed = new Set<DescansoTipo>([
    'PLANIFICADO', 'VACACIONES', 'PERMISO', 'ENFERMEDAD',
  ]);
  const out: Descanso[] = [];
  for (const r of rows) {
    const rowId = str(r[0]).trim();
    const id = str(r[1]).trim();
    if (!rowId || !id) continue;
    const fecha = parseGvizDate(r[3]);
    if (!fecha) continue;
    const tipoRaw = str(r[4]).toUpperCase().trim() as DescansoTipo;
    if (!allowed.has(tipoRaw)) continue;
    out.push({
      rowId,
      id,
      nombre: str(r[2]).trim(),
      fecha,
      tipo: tipoRaw,
      motivo: str(r[5]) || undefined,
      creadoEn: parseGvizDate(r[6]),
      actualizadoEn: parseGvizDate(r[7]),
    });
  }
  return out;
}

/**
 * FALTAS — columnas fijas: ROW_ID | ID | NOMBRE | FECHA | MOTIVO |
 * DESCUENTO | CREADO_EN | ACTUALIZADO_EN.
 */
export async function fetchFaltas(): Promise<Falta[]> {
  let rows: unknown[][];
  try {
    rows = await fetchPositional(TABS.faltas);
  } catch {
    return [];
  }
  const out: Falta[] = [];
  for (const r of rows) {
    const rowId = str(r[0]).trim();
    const id = str(r[1]).trim();
    if (!rowId || !id) continue;
    const fecha = parseGvizDate(r[3]);
    if (!fecha) continue;
    out.push({
      rowId,
      id,
      nombre: str(r[2]).trim(),
      fecha,
      motivo: str(r[4]) || undefined,
      descuento: numOrZero(r[5]),
      creadoEn: parseGvizDate(r[6]),
      actualizadoEn: parseGvizDate(r[7]),
    });
  }
  return out;
}

/**
 * EXTRAS — columnas fijas: ROW_ID | ID | NOMBRE | FECHA | CONCEPTO |
 * MONTO | CREADO_EN | ACTUALIZADO_EN.
 */
export async function fetchExtras(): Promise<Extra[]> {
  let rows: unknown[][];
  try {
    rows = await fetchPositional(TABS.extras);
  } catch {
    return [];
  }
  const out: Extra[] = [];
  for (const r of rows) {
    const rowId = str(r[0]).trim();
    const id = str(r[1]).trim();
    if (!rowId || !id) continue;
    const fecha = parseGvizDate(r[3]);
    if (!fecha) continue;
    out.push({
      rowId,
      id,
      nombre: str(r[2]).trim(),
      fecha,
      concepto: str(r[4]).trim(),
      monto: numOrZero(r[5]),
      creadoEn: parseGvizDate(r[6]),
      actualizadoEn: parseGvizDate(r[7]),
    });
  }
  return out;
}

/**
 * Lee PUNTUALIDAD (registro automático de tardanzas/multas).
 * Headers esperados:
 *   ID | NOMBRE | FECHA | HORA_ENTRADA | MIN_TARDE | MIN_TEMPRANO |
 *   NIVEL | PUNTOS | MULTA_PAGADA | MULTA_GANADA | TIMESTAMP
 */
export async function fetchPuntualidad(): Promise<Puntualidad[]> {
  let data: Record<string, unknown>[];
  try {
    ({ data } = await fetchTab(TABS.puntualidad, 1));
  } catch {
    return [];
  }
  const out: Puntualidad[] = [];
  for (const row of data) {
    const id = str(row['ID']).trim();
    if (!id) continue;
    const fecha = parseGvizDate(row['FECHA']);
    if (!fecha) continue;
    // HORA_ENTRADA puede venir como string "HH:mm:ss" o como objeto Date con
    // epoch 1899-12-30 (gviz envuelve horas en Date). Parseamos ambos casos.
    const horaRaw = row['HORA_ENTRADA'];
    let horaEntrada = '';
    const horaDate = parseGvizDate(horaRaw);
    if (horaDate) {
      horaEntrada =
        String(horaDate.getHours()).padStart(2, '0') + ':' +
        String(horaDate.getMinutes()).padStart(2, '0') + ':' +
        String(horaDate.getSeconds()).padStart(2, '0');
    } else {
      horaEntrada = str(horaRaw).trim();
    }
    out.push({
      id,
      nombre: str(row['NOMBRE']).trim(),
      fecha,
      horaEntrada,
      minTarde: numOrZero(row['MIN_TARDE']),
      minTemprano: numOrZero(row['MIN_TEMPRANO']),
      nivel: str(row['NIVEL']).trim(),
      puntos: numOrZero(row['PUNTOS']),
      multaPagada: numOrZero(row['MULTA_PAGADA']),
      multaGanada: numOrZero(row['MULTA_GANADA']),
      timestamp: parseGvizDate(row['TIMESTAMP']),
    });
  }
  return out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

/**
 * Lee asistencia (entrada/salida real) de la tab actual + tabs mensuales.
 * Cada tab se lee con headers normales (label match). Si una tab no existe se
 * ignora silenciosamente.
 */
function timeStr(v: unknown): string {
  // Apps Script / gviz devuelve horas como Date con epoch 1899-12-30. Las
  // convertimos a "HH:mm:ss" si vienen así, o las pasamos como string.
  const d = parseGvizDate(v);
  if (d) {
    return (
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0')
    );
  }
  return str(v).trim();
}

async function fetchAttendanceTab(tab: string): Promise<Asistencia[]> {
  let data: Record<string, unknown>[];
  try {
    ({ data } = await fetchTab(tab, 1));
  } catch {
    return [];
  }
  const out: Asistencia[] = [];
  for (const row of data) {
    const id = str(row['ID']).trim();
    if (!id) continue;
    const fecha = parseGvizDate(row['FECHA']);
    if (!fecha) continue;
    const he = timeStr(row['HORA ENTRADA']);
    const hs = timeStr(row['HORA SALIDA']);
    out.push({
      id,
      nombre: str(row['NOMBRE']).trim(),
      fecha,
      horaEntrada: he || undefined,
      horaSalida: hs || undefined,
      estado: str(row['ESTADO']) || undefined,
      minTarde: numOrZero(row['MIN TARDE']) || undefined,
      motivoTarde: str(row['MOTIVO TARDE']) || undefined,
      horasTrabajadas: str(row['HORAS TRABAJADAS']) || undefined,
      entradaDatetime: parseGvizDate(row['ENTRADA_DATETIME']),
      salidaDatetime: parseGvizDate(row['SALIDA_DATETIME']),
    });
  }
  return out;
}

export async function fetchAsistencia(): Promise<Asistencia[]> {
  const tabs = [TABS.asistenciaActual, ...TABS.asistenciaMeses];
  const results = await Promise.allSettled(tabs.map(fetchAttendanceTab));
  const all: Asistencia[] = [];
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);
  // Dedup por id|yyyy-MM-dd, prioriza la tab actual (que va primera)
  const seen = new Map<string, Asistencia>();
  for (const a of all) {
    const k = `${a.id}|${a.fecha.toISOString().slice(0, 10)}`;
    if (!seen.has(k)) seen.set(k, a);
  }
  return Array.from(seen.values()).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

/**
 * Lee la tab CONF y retorna la lista de usuarios con roles/permisos.
 * Esquema esperado (headers fila 1):
 *   key | rol | nombre | numero | nota | username | password | permisos
 */
export async function fetchConfUsers(): Promise<ConfUser[]> {
  const { data } = await fetchTab(TABS.conf, 1);
  const out: ConfUser[] = [];
  for (const row of data) {
    const key = str(row['key']).trim();
    if (!key) continue;
    const username = str(row['username']).trim().toLowerCase();
    if (!username) continue;
    const permRaw = str(row['permisos']).trim();
    const permisos = permRaw
      ? permRaw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)
      : ['read'];
    out.push({
      key,
      rol: str(row['rol']).trim(),
      nombre: str(row['nombre']).trim(),
      numero: str(row['numero']).replace(/\s+/g, ''),
      nota: str(row['nota']).trim(),
      username,
      password: str(row['password']),
      permisos,
    });
  }
  return out;
}
