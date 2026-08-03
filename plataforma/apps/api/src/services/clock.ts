import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { DIAS_MAX_SALIDA_PENDIENTE, MIN_MINUTES_BETWEEN_ENTRY_EXIT, MOTIVOS_TARDANZA } from '@asis/shared';
import type { ClockAction, ClockContext, ClockResult, PendienteSalida } from '@asis/shared';
import type { DB } from '../db';
import { attendance, businesses, employees, punctuality } from '../db/schema';
import { businessDate, fechaDisplay, formatDuration, hhmmssToMs, horaLimite, timeStrInTz, zonedTimeToUtc } from '../core/time';
import { checkGps } from '../core/gps';
import { calcularMultaGanada, computeMulta, evalEntrada } from '../core/punctuality';
import { notifyMarcacion, notifySalidaTardia } from '../reports/notify';

type Biz = typeof businesses.$inferSelect;
type Emp = typeof employees.$inferSelect;
type Att = typeof attendance.$inferSelect;

export interface ClockCtx {
  db: DB;
  now?: Date;
  ip?: string | null;
  ua?: string | null;
}

async function resolve(db: DB, token: string): Promise<{ emp: Emp; biz: Biz } | null> {
  const emp = (await db.select().from(employees).where(eq(employees.qrToken, token)).limit(1))[0];
  if (!emp) return null;
  const biz = (await db.select().from(businesses).where(eq(businesses.id, emp.businessId)).limit(1))[0];
  if (!biz) return null;
  return { emp, biz };
}

/** Marcaciones que el empleado puede hacer ahora, según lo ya registrado hoy. */
export function accionesDisponibles(row: Att | undefined, controlAlmuerzo: boolean): ClockAction[] {
  if (!row) return ['entrada'];
  if (row.salidaAt || row.horaSalida) return [];
  if (!controlAlmuerzo) return ['salida'];
  if (!row.almuerzoSalidaAt && !row.horaAlmuerzoSalida) return ['almuerzo_salida', 'salida'];
  if (!row.almuerzoRegresoAt && !row.horaAlmuerzoRegreso) return ['almuerzo_regreso'];
  return ['salida'];
}

function autoAction(acciones: ClockAction[]): ClockAction | null {
  if (acciones.includes('entrada')) return 'entrada';
  if (acciones.includes('almuerzo_regreso')) return 'almuerzo_regreso';
  if (acciones.includes('salida')) return 'salida';
  return acciones[0] ?? null;
}

/** Dispara las notificaciones (correo + WhatsApp) sin bloquear la respuesta. */
function notify(biz: Biz, emp: Emp, result: ClockResult): void {
  void notifyMarcacion({
    negocio: biz.nombre,
    empleado: emp.nombre,
    codigo: emp.codigo,
    reportEmails: biz.reportEmails,
    whatsappGrupoId: biz.whatsappGrupoId,
    result,
  }).catch(() => {});
}

async function rowDeHoy(db: DB, empId: string, fecha: string): Promise<Att | undefined> {
  return (
    await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, empId), eq(attendance.fecha, fecha)))
      .limit(1)
  )[0];
}

/** Resta `dias` a una fecha 'yyyy-MM-dd' y devuelve la fecha resultante 'yyyy-MM-dd'. */
function restarDiasISO(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

/**
 * Días RECIENTES anteriores a `fechaHoy` en los que el empleado entró pero nunca marcó su salida.
 * Solo se consideran los últimos `DIAS_MAX_SALIDA_PENDIENTE` días (p. ej. "la salida de ayer", con
 * margen para fines de semana): los días abiertos más antiguos son historial que NO bloquea la
 * marcación —se limpian desde el panel— para no arrastrar meses de salidas sin marcar.
 * Deben resolverse (registrando la salida manual) antes de que pueda marcar una nueva entrada.
 */
async function pendientesSalidaPrevias(db: DB, empId: string, fechaHoy: string): Promise<PendienteSalida[]> {
  const desde = restarDiasISO(fechaHoy, DIAS_MAX_SALIDA_PENDIENTE);
  const rows = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, empId),
        lt(attendance.fecha, fechaHoy),
        gte(attendance.fecha, desde),
        isNull(attendance.salidaAt),
        isNull(attendance.horaSalida),
      ),
    )
    .orderBy(asc(attendance.fecha));
  // Solo cuenta como "olvido de salida" si de verdad hubo entrada ese día.
  return rows
    .filter((r) => r.horaEntrada || r.entradaAt)
    .map((r) => ({
      attendanceId: r.id,
      fecha: r.fecha,
      fechaDisplay: fechaDisplay(r.fecha),
      horaEntrada: r.horaEntrada ?? null,
    }));
}

export async function getClockContext(
  db: DB,
  token: string,
  now = new Date(),
): Promise<ClockContext | null> {
  const r = await resolve(db, token);
  if (!r) return null;
  const { emp, biz } = r;
  const fecha = businessDate(now, biz.timezone, biz.dayCutoffHour);
  const row = await rowDeHoy(db, emp.id, fecha);
  const pendientesSalida = biz.activo ? await pendientesSalidaPrevias(db, emp.id, fecha) : [];
  return {
    business: {
      nombre: biz.nombre,
      branding: biz.branding,
      gpsRequerido: biz.gpsRequerido,
      radioMetros: biz.radioMetros,
      lat: biz.lat,
      lng: biz.lng,
      horaLimiteHoy: horaLimite(biz, now),
    },
    employee: { nombre: emp.nombre, codigo: emp.codigo },
    acciones: biz.activo ? accionesDisponibles(row, biz.controlAlmuerzo) : [],
    pendientesSalida,
    suspendido: !biz.activo,
  };
}

export async function clock(
  ctx: ClockCtx,
  input: { token: string; lat?: number; lng?: number; action?: ClockAction },
): Promise<ClockResult | null> {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const r = await resolve(db, input.token);
  if (!r) return null;
  const { emp, biz } = r;

  if (!biz.activo) return { kind: 'suspendido', nombre: emp.nombre };

  const gps = checkGps(biz, input.lat, input.lng);
  if (biz.gpsRequerido && !gps.valido) {
    return { kind: 'fuera_de_rango', nombre: emp.nombre, distM: gps.dist ?? -1, radioM: biz.radioMetros };
  }

  const fecha = businessDate(now, biz.timezone, biz.dayCutoffHour);
  const existing = await rowDeHoy(db, emp.id, fecha);
  const acciones = accionesDisponibles(existing, biz.controlAlmuerzo);

  if (acciones.length === 0) return { kind: 'completo', nombre: emp.nombre, fecha };

  const action =
    input.action && acciones.includes(input.action) ? input.action : autoAction(acciones);
  if (!action) return { kind: 'completo', nombre: emp.nombre, fecha };

  // Antes de abrir un nuevo día, exige que el empleado cierre los días anteriores en que
  // olvidó marcar su salida (deben registrarla manualmente, queda pendiente de aprobación).
  if (action === 'entrada') {
    const pendientes = await pendientesSalidaPrevias(db, emp.id, fecha);
    if (pendientes.length > 0) return { kind: 'salida_pendiente', nombre: emp.nombre, pendientes };
  }

  const hora = timeStrInTz(now, biz.timezone);

  // ── ENTRADA ────────────────────────────────────────────────────────────────
  if (action === 'entrada') {
    const limite = horaLimite(biz, now);
    const ev = evalEntrada(hhmmssToMs(hora)!, hhmmssToMs(limite)!);
    await db.insert(attendance).values({
      businessId: biz.id,
      employeeId: emp.id,
      fecha,
      horaEntrada: hora,
      entradaAt: now,
      estado: ev.estado,
      minTarde: ev.minTarde,
      gpsLat: input.lat ?? null,
      gpsLng: input.lng ?? null,
      gpsDist: gps.dist,
      gpsValido: gps.provided ? gps.valido : null,
      ip: ctx.ip ?? null,
      userAgent: ctx.ua ?? null,
    });

    const medal = biz.controlMedallas ? ev.medal : null;

    if (ev.estado === 'TARDE' && biz.controlMultas) {
      const multa = computeMulta(ev.minTarde, biz.multaMonto, biz.multaIntervaloMin);
      return {
        kind: 'tardanza_motivo',
        nombre: emp.nombre,
        fecha,
        horaEntrada: hora,
        minTarde: ev.minTarde,
        multa,
        motivos: [...MOTIVOS_TARDANZA],
      };
    }

    await registrarPuntualidad(db, {
      biz,
      emp,
      fecha,
      hora,
      minTarde: ev.estado === 'TARDE' ? ev.minTarde : 0,
      minTemprano: ev.minTemprano,
      nivel: medal
        ? `${medal.emoji} ${medal.nombre}`
        : ev.estado === 'TARDE'
          ? '⚠️ Tarde'
          : '⏰ A tiempo',
      puntos: medal?.puntos ?? 0,
      multaPagada: 0,
    });
    const res: ClockResult = {
      kind: 'entrada',
      nombre: emp.nombre,
      fecha,
      horaEntrada: hora,
      estado: ev.estado,
      minTemprano: ev.minTemprano,
      minTarde: ev.estado === 'TARDE' ? ev.minTarde : 0,
      medal,
    };
    notify(biz, emp, res);
    return res;
  }

  const row = existing!;

  // ── SALIDA A ALMUERZO ────────────────────────────────────────────────────────
  if (action === 'almuerzo_salida') {
    await db
      .update(attendance)
      .set({ horaAlmuerzoSalida: hora, almuerzoSalidaAt: now })
      .where(eq(attendance.id, row.id));
    const res: ClockResult = { kind: 'almuerzo_salida', nombre: emp.nombre, fecha, hora };
    notify(biz, emp, res);
    return res;
  }

  // ── REGRESO DE ALMUERZO ──────────────────────────────────────────────────────
  if (action === 'almuerzo_regreso') {
    await db
      .update(attendance)
      .set({ horaAlmuerzoRegreso: hora, almuerzoRegresoAt: now })
      .where(eq(attendance.id, row.id));
    const res: ClockResult = { kind: 'almuerzo_regreso', nombre: emp.nombre, fecha, hora };
    notify(biz, emp, res);
    return res;
  }

  // ── SALIDA ───────────────────────────────────────────────────────────────────
  // Anti doble-tap: solo si sale sin haber tomado almuerzo y muy pronto tras entrar.
  if (row.entradaAt && !row.almuerzoRegresoAt) {
    const diffMin = Math.floor((now.getTime() - new Date(row.entradaAt).getTime()) / 60000);
    if (diffMin < MIN_MINUTES_BETWEEN_ENTRY_EXIT) {
      return { kind: 'espera', nombre: emp.nombre, minutosRestantes: MIN_MINUTES_BETWEEN_ENTRY_EXIT - diffMin };
    }
  }

  let ms = row.entradaAt ? now.getTime() - new Date(row.entradaAt).getTime() : 0;
  // Descuenta el almuerzo de las horas trabajadas.
  if (row.almuerzoSalidaAt && row.almuerzoRegresoAt) {
    ms -= new Date(row.almuerzoRegresoAt).getTime() - new Date(row.almuerzoSalidaAt).getTime();
  }
  const horasTxt = ms > 0 ? formatDuration(ms) : '';

  await db
    .update(attendance)
    .set({ horaSalida: hora, salidaAt: now, horasTrabajadas: horasTxt })
    .where(eq(attendance.id, row.id));

  const res: ClockResult = {
    kind: 'salida',
    nombre: emp.nombre,
    fecha,
    horaEntrada: row.horaEntrada ?? '',
    horaSalida: hora,
    horasTrabajadas: horasTxt,
    estado: row.estado,
    minTarde: row.minTarde,
  };
  notify(biz, emp, res);
  return res;
}

export async function clockMotivo(
  ctx: ClockCtx,
  input: { token: string; motivo: string },
): Promise<ClockResult | null> {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const r = await resolve(db, input.token);
  if (!r) return null;
  const { emp, biz } = r;

  const fecha = businessDate(now, biz.timezone, biz.dayCutoffHour);
  const row = await rowDeHoy(db, emp.id, fecha);
  if (!row) return null;

  await db.update(attendance).set({ motivoTarde: input.motivo }).where(eq(attendance.id, row.id));

  const hora = row.horaEntrada ?? timeStrInTz(now, biz.timezone);
  const multa = computeMulta(row.minTarde, biz.multaMonto, biz.multaIntervaloMin);
  await registrarPuntualidad(db, {
    biz,
    emp,
    fecha,
    hora,
    minTarde: row.minTarde,
    minTemprano: 0,
    nivel: '⚠️ Tarde',
    puntos: 0,
    multaPagada: multa,
  });

  const res: ClockResult = {
    kind: 'entrada',
    nombre: emp.nombre,
    fecha,
    horaEntrada: hora,
    estado: 'TARDE',
    minTemprano: 0,
    minTarde: row.minTarde,
    medal: null,
  };
  notify(biz, emp, res);
  return res;
}

/**
 * El empleado registra manualmente la salida de un día anterior que olvidó marcar.
 * La salida queda como `PENDIENTE` de aprobación por el panel (no cuenta horas extra hasta aprobarse),
 * pero deja de bloquear la marcación de hoy: tras registrarla puede marcar su entrada de inmediato.
 */
export async function registrarSalidaManual(
  ctx: ClockCtx,
  input: { token: string; attendanceId: string; horaSalida: string },
): Promise<ClockResult | null> {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const r = await resolve(db, input.token);
  if (!r) return null;
  const { emp, biz } = r;

  const row = (await db.select().from(attendance).where(eq(attendance.id, input.attendanceId)).limit(1))[0];
  // La fila debe existir, ser de este empleado y estar realmente abierta (sin salida).
  if (!row || row.employeeId !== emp.id) return null;
  const fechaHoy = businessDate(now, biz.timezone, biz.dayCutoffHour);
  if (row.horaSalida || row.salidaAt || row.fecha >= fechaHoy) {
    // Ya no está pendiente (o no es un día anterior): devuelve el estado actual sin duplicar.
    const restantes = await pendientesSalidaPrevias(db, emp.id, fechaHoy);
    return { kind: 'salida_manual_ok', nombre: emp.nombre, fecha: row.fecha, horaSalida: row.horaSalida ?? '', restantes };
  }

  const salidaAt = zonedTimeToUtc(row.fecha, input.horaSalida, biz.timezone);
  let ms = row.entradaAt ? salidaAt.getTime() - new Date(row.entradaAt).getTime() : 0;
  if (row.almuerzoSalidaAt && row.almuerzoRegresoAt) {
    ms -= new Date(row.almuerzoRegresoAt).getTime() - new Date(row.almuerzoSalidaAt).getTime();
  }
  const horasTxt = ms > 0 ? formatDuration(ms) : '';

  await db
    .update(attendance)
    .set({
      horaSalida: input.horaSalida,
      salidaAt,
      horasTrabajadas: horasTxt,
      salidaManual: true,
      salidaAprob: 'PENDIENTE',
    })
    .where(eq(attendance.id, row.id));

  // Avisa al negocio que hay una salida tardía por aprobar (no bloquea la respuesta).
  void notifySalidaTardia({
    negocio: biz.nombre,
    empleado: emp.nombre,
    codigo: emp.codigo,
    fecha: row.fecha,
    fechaDisplay: fechaDisplay(row.fecha),
    horaEntrada: row.horaEntrada ?? '',
    horaSalida: input.horaSalida,
    reportEmails: biz.reportEmails,
    whatsappGrupoId: biz.whatsappGrupoId,
  }).catch(() => {});

  const restantes = await pendientesSalidaPrevias(db, emp.id, fechaHoy);
  return { kind: 'salida_manual_ok', nombre: emp.nombre, fecha: row.fecha, horaSalida: input.horaSalida, restantes };
}

export interface PuntInput {
  biz: Biz;
  emp: Emp;
  fecha: string;
  hora: string;
  minTarde: number;
  minTemprano: number;
  nivel: string;
  puntos: number;
  multaPagada: number;
}

/** Inserta/actualiza la fila de puntualidad del día y recalcula el pozo de multas. Reutilizado por la marcación en vivo y por la edición manual de un registro desde el panel. */
export async function registrarPuntualidad(db: DB, p: PuntInput): Promise<void> {
  await db
    .insert(punctuality)
    .values({
      businessId: p.biz.id,
      employeeId: p.emp.id,
      fecha: p.fecha,
      horaEntrada: p.hora,
      minTarde: p.minTarde,
      minTemprano: p.minTemprano,
      nivel: p.nivel,
      puntos: p.puntos,
      multaPagada: p.multaPagada,
      multaGanada: 0,
    })
    .onConflictDoUpdate({
      target: [punctuality.employeeId, punctuality.fecha],
      set: {
        horaEntrada: p.hora,
        minTarde: p.minTarde,
        minTemprano: p.minTemprano,
        nivel: p.nivel,
        puntos: p.puntos,
        multaPagada: p.multaPagada,
      },
    });
  await recalcPozoDia(db, p.biz.id, p.fecha);
}

/** Recalcula el reparto del pozo de multas del día para un negocio. */
export async function recalcPozoDia(db: DB, businessId: string, fecha: string): Promise<void> {
  const rows = await db
    .select()
    .from(punctuality)
    .where(and(eq(punctuality.businessId, businessId), eq(punctuality.fecha, fecha)));

  const ganada = calcularMultaGanada(
    rows.map((r) => ({ horaEntradaMs: hhmmssToMs(r.horaEntrada), multaPagada: r.multaPagada })),
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.multaGanada !== ganada[i]) {
      await db.update(punctuality).set({ multaGanada: ganada[i]! }).where(eq(punctuality.id, row.id));
    }
  }
}
