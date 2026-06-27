// Importa empleados desde un Google Sheet existente (vía gviz, sin credenciales).
// Uso:
//   MIGRATE_SHEET_ID=<id> MIGRATE_BUSINESS_SLUG=ginitafruits pnpm migrate:sheets
// Opcional: MIGRATE_TAB=EMPLEADOS (por defecto).
import { and, eq } from 'drizzle-orm';
import { getDb, runMigrations } from './db';
import { businesses, employees } from './db/schema';
import { generateQrToken } from './lib/qr';

const SHEET_ID = process.env.MIGRATE_SHEET_ID ?? '';
const BUSINESS_SLUG = process.env.MIGRATE_BUSINESS_SLUG ?? '';
const TAB = process.env.MIGRATE_TAB ?? 'EMPLEADOS';

interface Row {
  [key: string]: unknown;
}

async function gviz(sheetId: string, tab: string): Promise<Row[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gviz HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
  const cols: string[] = json.table.cols.map((c: { label?: string }) =>
    String(c.label ?? '').trim().toUpperCase(),
  );
  return json.table.rows.map((r: { c: ({ v: unknown } | null)[] }) => {
    const o: Row = {};
    r.c.forEach((cell, i) => {
      o[cols[i] || `COL${i}`] = cell ? cell.v : null;
    });
    return o;
  });
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}
function num(v: unknown): number {
  return Number(v) || 0;
}

async function main(): Promise<void> {
  if (!SHEET_ID || !BUSINESS_SLUG) {
    console.error('Falta MIGRATE_SHEET_ID y/o MIGRATE_BUSINESS_SLUG.');
    process.exit(1);
  }
  await runMigrations();
  const db = await getDb();

  const biz = (
    await db.select().from(businesses).where(eq(businesses.slug, BUSINESS_SLUG)).limit(1)
  )[0];
  if (!biz) {
    console.error(`No existe negocio con slug "${BUSINESS_SLUG}". Corre el seed primero.`);
    process.exit(1);
  }

  const rows = await gviz(SHEET_ID, TAB);
  let creados = 0;
  let saltados = 0;

  for (const r of rows) {
    const codigo = str(r.ID || r['CÓDIGO'] || r.CODIGO);
    const nombre = str(r.NOMBRE);
    if (!codigo || !nombre) continue;

    const exists = (
      await db
        .select()
        .from(employees)
        .where(and(eq(employees.businessId, biz.id), eq(employees.codigo, codigo)))
        .limit(1)
    )[0];
    if (exists) {
      saltados++;
      continue;
    }

    await db.insert(employees).values({
      businessId: biz.id,
      codigo,
      qrToken: generateQrToken(),
      nombre,
      sueldo: num(r.SUELDO),
      sueldoFds: num(r.SUELDO_FDS) || num(r.SUELDO),
      estado: str(r.ESTADO).toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
      deudaInicial: num(r.DEUDA_INICIAL),
    });
    creados++;
  }

  console.log(`✓ Migración de empleados: ${creados} creados, ${saltados} ya existían.`);
  console.log('  (El histórico de asistencia se puede importar después; los QR se generan nuevos.)');
  process.exit(0);
}

void main();
