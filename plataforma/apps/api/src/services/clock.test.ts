import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { attendance, businesses, employees, punctuality } from '../db/schema';
import * as schema from '../db/schema';
import { clock, clockMotivo } from './clock';

async function setup(): Promise<DB> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.resolve('drizzle') });
  return db;
}

describe('flujo de marcación (integración con PGlite)', () => {
  it('entrada temprano da medalla; salida calcula horas; tardanza paga multa al más temprano', async () => {
    const db = await setup();

    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'test',
          nombre: 'Test',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horaEntradaLv: '08:00:00',
          horaEntradaFds: '08:00:00',
          multaPorMin: 0.1,
          dayCutoffHour: 2,
          gpsRequerido: false,
        })
        .returning()
    )[0]!;

    const ana = (
      await db
        .insert(employees)
        .values({ businessId: biz.id, codigo: 'A', qrToken: 'tokenAAAAAAAA', nombre: 'Ana' })
        .returning()
    )[0]!;
    const beto = (
      await db
        .insert(employees)
        .values({ businessId: biz.id, codigo: 'B', qrToken: 'tokenBBBBBBBB', nombre: 'Beto' })
        .returning()
    )[0]!;

    // Ana entra 07:45 local (12:45Z) → temprano 15 min → medalla oro
    const r1 = await clock({ db, now: new Date('2026-06-29T12:45:00Z') }, { token: 'tokenAAAAAAAA' });
    expect(r1?.kind).toBe('entrada');
    if (r1?.kind === 'entrada') {
      expect(r1.estado).toBe('TEMPRANO');
      expect(r1.medal?.key).toBe('oro');
    }

    // Ana sale 07:55 local (12:55Z) → salida, 0h 10m
    const r2 = await clock({ db, now: new Date('2026-06-29T12:55:00Z') }, { token: 'tokenAAAAAAAA' });
    expect(r2?.kind).toBe('salida');
    if (r2?.kind === 'salida') expect(r2.horasTrabajadas).toBe('0h 10m');

    // Beto entra 08:10 local (13:10Z) → tardanza, multa 1.00
    const r3 = await clock({ db, now: new Date('2026-06-29T13:10:00Z') }, { token: 'tokenBBBBBBBB' });
    expect(r3?.kind).toBe('tardanza_motivo');
    if (r3?.kind === 'tardanza_motivo') {
      expect(r3.minTarde).toBe(10);
      expect(r3.multa).toBe(1);
    }

    // Beto elige motivo → se registra la multa
    const r4 = await clockMotivo(
      { db, now: new Date('2026-06-29T13:11:00Z') },
      { token: 'tokenBBBBBBBB', motivo: 'Tráfico' },
    );
    expect(r4?.kind).toBe('entrada');

    // El pozo (multa de Beto) va a Ana, la más temprana del día
    const puntAna = (await db.select().from(punctuality).where(eq(punctuality.employeeId, ana.id)))[0];
    const puntBeto = (await db.select().from(punctuality).where(eq(punctuality.employeeId, beto.id)))[0];
    expect(puntBeto?.multaPagada).toBe(1);
    expect(puntAna?.multaGanada).toBe(1);
    expect(puntBeto?.multaGanada).toBe(0);

    // La asistencia de Beto quedó TARDE con su motivo
    const attBeto = (await db.select().from(attendance).where(eq(attendance.employeeId, beto.id)))[0];
    expect(attBeto?.estado).toBe('TARDE');
    expect(attBeto?.motivoTarde).toBe('Tráfico');
  });

  it('flujo con almuerzo: descuenta el almuerzo de las horas trabajadas', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'lunch',
          nombre: 'Lunch',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horaEntradaLv: '08:00:00',
          horaEntradaFds: '08:00:00',
          multaPorMin: 0.1,
          dayCutoffHour: 2,
          gpsRequerido: false,
        })
        .returning()
    )[0]!;
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'L1', qrToken: 'tokenLLLLLLLL', nombre: 'Luz' });

    const tok = { token: 'tokenLLLLLLLL' };
    // 08:00 entrada (13:00Z)
    expect((await clock({ db, now: new Date('2026-06-29T13:00:00Z') }, { ...tok, action: 'entrada' }))?.kind).toBe('entrada');
    // 12:00 sale a almuerzo (17:00Z)
    expect((await clock({ db, now: new Date('2026-06-29T17:00:00Z') }, { ...tok, action: 'almuerzo_salida' }))?.kind).toBe('almuerzo_salida');
    // 13:00 regresa (18:00Z)
    expect((await clock({ db, now: new Date('2026-06-29T18:00:00Z') }, { ...tok, action: 'almuerzo_regreso' }))?.kind).toBe('almuerzo_regreso');
    // 17:00 salida (22:00Z) → 9h jornada − 1h almuerzo = 8h
    const out = await clock({ db, now: new Date('2026-06-29T22:00:00Z') }, { ...tok, action: 'salida' });
    expect(out?.kind).toBe('salida');
    if (out?.kind === 'salida') expect(out.horasTrabajadas).toBe('8h 00m');
  });

  it('rechaza marcación fuera del rango GPS cuando el negocio lo exige', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'gps',
          nombre: 'GPS',
          lat: -3.677506,
          lng: -79.687398,
          radioMetros: 80,
          gpsRequerido: true,
        })
        .returning()
    )[0]!;
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'C', qrToken: 'tokenCCCCCCCC', nombre: 'Caro' });

    const lejos = await clock({ db }, { token: 'tokenCCCCCCCC', lat: -3.7, lng: -79.7 });
    expect(lejos?.kind).toBe('fuera_de_rango');
  });
});
