import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { attendance, punctuality } from '../db/schema';
import * as schema from '../db/schema';
import { clock, clockMotivo } from './clock';
import { deleteAttendanceRecord, findAttendance, updateAttendanceRecord } from './attendance';

async function setup(): Promise<DB> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.resolve('drizzle') });
  return db;
}

function horariosFijos(hora: string) {
  return {
    lunes: hora,
    martes: hora,
    miercoles: hora,
    jueves: hora,
    viernes: hora,
    sabado: hora,
    domingo: hora,
  };
}

async function setupNegocioConDosEmpleados(db: DB) {
  const { businesses, employees } = schema;
  const biz = (
    await db
      .insert(businesses)
      .values({
        slug: 'edit-test',
        nombre: 'EditTest',
        timezone: 'America/Guayaquil',
        radioMetros: 80,
        horarios: horariosFijos('08:00:00'),
        multaMonto: 0.1,
        multaIntervaloMin: 1,
        dayCutoffHour: 2,
        gpsRequerido: false,
      })
      .returning()
  )[0]!;
  const ana = (
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'A', qrToken: 'tokenEDITAAAA', nombre: 'Ana' })
      .returning()
  )[0]!;
  const beto = (
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'B', qrToken: 'tokenEDITBBBB', nombre: 'Beto' })
      .returning()
  )[0]!;
  return { biz, ana, beto };
}

describe('updateAttendanceRecord', () => {
  it('corregir la entrada de TARDE a TEMPRANO recalcula estado, minTarde y quita la multa', async () => {
    const db = await setup();
    const { ana } = await setupNegocioConDosEmpleados(db);

    // Ana entra 08:20 (13:20Z) → tardanza, pide motivo.
    const r1 = await clock({ db, now: new Date('2026-06-29T13:20:00Z') }, { token: 'tokenEDITAAAA' });
    expect(r1?.kind).toBe('tardanza_motivo');
    await clockMotivo({ db, now: new Date('2026-06-29T13:21:00Z') }, { token: 'tokenEDITAAAA', motivo: 'Bus' });

    const row = (await db.select().from(attendance).where(eq(attendance.employeeId, ana.id)))[0]!;
    expect(row.estado).toBe('TARDE');
    expect(row.minTarde).toBe(20);

    // El admin corrige: en realidad marcó 07:50 (llegó temprano).
    const updated = await updateAttendanceRecord(db, row, { horaEntrada: '07:50:00' });
    expect(updated.estado).toBe('TEMPRANO');
    expect(updated.minTarde).toBe(0);
    expect(updated.horaEntrada).toBe('07:50:00');

    const punt = (await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id)))[0]!;
    expect(punt.minTarde).toBe(0);
    expect(punt.multaPagada).toBe(0);
  });

  it('corregir la entrada redistribuye el pozo de multas del día entre los empleados', async () => {
    const db = await setup();
    const { ana, beto } = await setupNegocioConDosEmpleados(db);

    // Ana entra a tiempo (08:00 → 13:00Z). Beto entra tarde (08:10 → 13:10Z) y paga $1.
    await clock({ db, now: new Date('2026-06-29T13:00:00Z') }, { token: 'tokenEDITAAAA' });
    await clock({ db, now: new Date('2026-06-29T13:10:00Z') }, { token: 'tokenEDITBBBB' });
    await clockMotivo({ db, now: new Date('2026-06-29T13:11:00Z') }, { token: 'tokenEDITBBBB', motivo: 'Tráfico' });

    // El pozo de Beto ($1) va a Ana, la más temprana.
    let puntAna = (await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id)))[0]!;
    expect(puntAna.multaGanada).toBe(1);

    // El admin corrige la entrada de Ana a 09:00 (después de Beto, y 60 min tarde ella misma
    // contra el límite de 08:00 → paga $6 propios) — ahora Beto es el más temprano y se lleva
    // todo el pozo del día: su $1 + los $6 nuevos de Ana = $7.
    const rowAna = (await db.select().from(attendance).where(eq(attendance.employeeId, ana.id)))[0]!;
    const updatedAna = await updateAttendanceRecord(db, rowAna, { horaEntrada: '09:00:00' });
    expect(updatedAna.estado).toBe('TARDE');

    puntAna = (await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id)))[0]!;
    const puntBeto = (await db.select().from(punctuality).where(eq(punctuality.employeeId, beto.id)))[0]!;
    expect(puntAna.multaPagada).toBe(6);
    expect(puntAna.multaGanada).toBe(0);
    expect(puntBeto.multaGanada).toBe(7);
  });

  it('agregar una salida que faltaba calcula las horas trabajadas', async () => {
    const db = await setup();
    const { ana } = await setupNegocioConDosEmpleados(db);

    await clock({ db, now: new Date('2026-06-29T13:00:00Z') }, { token: 'tokenEDITAAAA', action: 'entrada' });
    const row = (await db.select().from(attendance).where(eq(attendance.employeeId, ana.id)))[0]!;
    expect(row.horaSalida).toBeNull();

    // El empleado se olvidó de marcar salida; el admin la agrega manualmente (entrada 08:00,
    // salida 17:00, sin almuerzo marcado en este negocio → 9h corridas).
    const updated = await updateAttendanceRecord(db, row, { horaSalida: '17:00:00' });
    expect(updated.horaSalida).toBe('17:00:00');
    expect(updated.horasTrabajadas).toBe('9h 00m');
  });
});

describe('deleteAttendanceRecord', () => {
  it('borra la fila de puntualidad asociada y recalcula el pozo del día', async () => {
    const db = await setup();
    const { ana, beto } = await setupNegocioConDosEmpleados(db);

    await clock({ db, now: new Date('2026-06-29T13:00:00Z') }, { token: 'tokenEDITAAAA' }); // Ana a tiempo
    await clock({ db, now: new Date('2026-06-29T13:10:00Z') }, { token: 'tokenEDITBBBB' }); // Beto tarde
    await clockMotivo({ db, now: new Date('2026-06-29T13:11:00Z') }, { token: 'tokenEDITBBBB', motivo: 'Tráfico' });

    let puntAna = (await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id)))[0]!;
    expect(puntAna.multaGanada).toBe(1); // Ana ganó el pozo por ser la más temprana

    // Se elimina el registro de Ana (era una marcación duplicada de prueba).
    const rowAna = (await findAttendance(db, (await db.select().from(attendance).where(eq(attendance.employeeId, ana.id)))[0]!.id))!;
    await deleteAttendanceRecord(db, rowAna);

    const attAna = await db.select().from(attendance).where(eq(attendance.employeeId, ana.id));
    expect(attAna).toHaveLength(0);
    const puntAnaAfter = await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id));
    expect(puntAnaAfter).toHaveLength(0); // la puntualidad huérfana también se elimina

    // Con Ana fuera, el pozo de Beto ya no tiene a quién repartirse (es el único que queda).
    const puntBeto = (await db.select().from(punctuality).where(eq(punctuality.employeeId, beto.id)))[0]!;
    expect(puntBeto.multaGanada).toBe(1);
  });
});
