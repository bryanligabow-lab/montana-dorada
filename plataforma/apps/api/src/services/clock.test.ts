import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { attendance, businesses, employees, punctuality } from '../db/schema';
import * as schema from '../db/schema';
import { clock, clockMotivo, getClockContext, registrarSalidaManual } from './clock';
import { aprobarSalida } from './attendance';

async function setup(): Promise<DB> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.resolve('drizzle') });
  return db;
}

/** Mismo horario los 7 días (para tests que no dependen del día de la semana). */
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
          horarios: horariosFijos('08:00:00'),
          multaMonto: 0.1,
          multaIntervaloMin: 1,
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

  it('respeta los interruptores del negocio (sin almuerzo, sin multas)', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'simple',
          nombre: 'Simple',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horarios: horariosFijos('08:00:00'),
          multaMonto: 0.1,
          multaIntervaloMin: 1,
          dayCutoffHour: 2,
          gpsRequerido: false,
          controlAlmuerzo: false,
          controlMultas: false,
          controlMedallas: false,
        })
        .returning()
    )[0]!;
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'S1', qrToken: 'tokenSSSSSSSS', nombre: 'Sol' });

    // Entrada tarde 09:00 (14:00Z): sin multas → es 'entrada' TARDE, sin pedir motivo ni medalla.
    const r = await clock({ db, now: new Date('2026-06-29T14:00:00Z') }, { token: 'tokenSSSSSSSS', action: 'entrada' });
    expect(r?.kind).toBe('entrada');
    if (r?.kind === 'entrada') {
      expect(r.estado).toBe('TARDE');
      expect(r.medal).toBeNull();
    }
    // Sin control de almuerzo, la única acción siguiente es salir.
    const ctx = await getClockContext(db, 'tokenSSSSSSSS', new Date('2026-06-29T14:30:00Z'));
    expect(ctx?.acciones).toEqual(['salida']);
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

  it('cobra la multa por bloques completos (ej. cada 30 min), no por minuto exacto', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'bloques',
          nombre: 'Bloques',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horarios: horariosFijos('08:00:00'),
          multaMonto: 1,
          multaIntervaloMin: 30,
          dayCutoffHour: 2,
          gpsRequerido: false,
        })
        .returning()
    )[0]!;
    await db.insert(employees).values([
      { businessId: biz.id, codigo: 'B1', qrToken: 'tokenBLOQUEB1', nombre: 'Bruno' },
      { businessId: biz.id, codigo: 'B2', qrToken: 'tokenBLOQUEC1', nombre: 'Carla' },
    ]);

    // Bruno: 5 min tarde (08:05) → primer bloque de 30 min → $1.
    const r1 = await clock({ db, now: new Date('2026-06-29T13:05:00Z') }, { token: 'tokenBLOQUEB1', action: 'entrada' });
    expect(r1?.kind).toBe('tardanza_motivo');
    if (r1?.kind === 'tardanza_motivo') {
      expect(r1.minTarde).toBe(5);
      expect(r1.multa).toBe(1);
    }

    // Carla: 35 min tarde (08:35) → entra al 2º bloque de 30 min → $2.
    const r2 = await clock({ db, now: new Date('2026-06-29T13:35:00Z') }, { token: 'tokenBLOQUEC1', action: 'entrada' });
    expect(r2?.kind).toBe('tardanza_motivo');
    if (r2?.kind === 'tardanza_motivo') {
      expect(r2.minTarde).toBe(35);
      expect(r2.multa).toBe(2);
    }
  });

  it('usa el horario límite del día de la semana correspondiente, no uno fijo', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'semana',
          nombre: 'Semana',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horarios: { ...horariosFijos('08:00:00'), martes: '10:00:00' },
          multaMonto: 0.1,
          multaIntervaloMin: 1,
          dayCutoffHour: 2,
          gpsRequerido: false,
        })
        .returning()
    )[0]!;
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'W1', qrToken: 'tokenSEMANAW1', nombre: 'Wendy' });

    // Lunes 29-jun (límite 08:00): entra 08:30 local (13:30Z) → TARDE.
    const lunes = await clock({ db, now: new Date('2026-06-29T13:30:00Z') }, { token: 'tokenSEMANAW1', action: 'entrada' });
    expect(lunes?.kind).toBe('tardanza_motivo');

    // Cierra el lunes con su salida; si no, el martes se bloquearía por "salida pendiente" del día anterior.
    const salidaLunes = await clock({ db, now: new Date('2026-06-29T23:00:00Z') }, { token: 'tokenSEMANAW1', action: 'salida' });
    expect(salidaLunes?.kind).toBe('salida');

    // Martes 30-jun (límite 10:00, día distinto): mismo reloj 08:30 local (13:30Z) → TEMPRANO.
    const martes = await clock({ db, now: new Date('2026-06-30T13:30:00Z') }, { token: 'tokenSEMANAW1', action: 'entrada' });
    expect(martes?.kind).toBe('entrada');
    if (martes?.kind === 'entrada') expect(martes.estado).toBe('TEMPRANO');
  });

  it('olvido de salida: bloquea la entrada del día siguiente hasta registrar la salida manual (queda pendiente)', async () => {
    const db = await setup();
    const biz = (
      await db
        .insert(businesses)
        .values({
          slug: 'olvido',
          nombre: 'Olvido',
          timezone: 'America/Guayaquil',
          radioMetros: 80,
          horarios: horariosFijos('08:00:00'),
          horariosSalida: horariosFijos('17:00:00'),
          multaMonto: 0.1,
          multaIntervaloMin: 1,
          dayCutoffHour: 2,
          gpsRequerido: false,
        })
        .returning()
    )[0]!;
    await db
      .insert(employees)
      .values({ businessId: biz.id, codigo: 'O1', qrToken: 'tokenOLVIDOO1', nombre: 'Oscar' });

    // Día 1 (lunes 29-jun): entra 07:30 local (12:30Z), NUNCA marca salida.
    const d1 = await clock({ db, now: new Date('2026-06-29T12:30:00Z') }, { token: 'tokenOLVIDOO1', action: 'entrada' });
    expect(d1?.kind).toBe('entrada');

    // Día 2 (martes 30-jun): intenta entrar → bloqueado por la salida pendiente del día anterior.
    const bloqueo = await clock({ db, now: new Date('2026-06-30T12:30:00Z') }, { token: 'tokenOLVIDOO1', action: 'entrada' });
    expect(bloqueo?.kind).toBe('salida_pendiente');
    let pendId = '';
    if (bloqueo?.kind === 'salida_pendiente') {
      expect(bloqueo.pendientes).toHaveLength(1);
      expect(bloqueo.pendientes[0]!.fecha).toBe('2026-06-29');
      pendId = bloqueo.pendientes[0]!.attendanceId;
    }

    // El contexto de la PWA también refleja el pendiente.
    const ctx = await getClockContext(db, 'tokenOLVIDOO1', new Date('2026-06-30T12:30:00Z'));
    expect(ctx?.pendientesSalida).toHaveLength(1);

    // Registra la salida del día olvidado → queda PENDIENTE, sin días restantes.
    const sm = await registrarSalidaManual(
      { db, now: new Date('2026-06-30T12:31:00Z') },
      { token: 'tokenOLVIDOO1', attendanceId: pendId, horaSalida: '17:05:00' },
    );
    expect(sm?.kind).toBe('salida_manual_ok');
    if (sm?.kind === 'salida_manual_ok') expect(sm.restantes).toHaveLength(0);

    const row = (await db.select().from(attendance).where(eq(attendance.id, pendId)).limit(1))[0]!;
    expect(row.salidaManual).toBe(true);
    expect(row.salidaAprob).toBe('PENDIENTE');
    expect(row.horaSalida).toBe('17:05:00');

    // Ahora sí puede marcar su entrada de hoy, sin esperar la aprobación.
    const d2 = await clock({ db, now: new Date('2026-06-30T12:32:00Z') }, { token: 'tokenOLVIDOO1', action: 'entrada' });
    expect(d2?.kind).toBe('entrada');

    // El panel aprueba la salida manual → queda APROBADA.
    const aprobada = await aprobarSalida(db, row, true);
    expect(aprobada.salidaAprob).toBe('APROBADA');
  });
});
