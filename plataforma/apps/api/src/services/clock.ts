import { and, eq } from 'drizzle-orm';
import { MIN_MINUTES_BETWEEN_ENTRY_EXIT, MOTIVOS_TARDANZA } from '@asis/shared';
import type { ClockContext, ClockResult } from '@asis/shared';
import type { DB } from '../db';
import { attendance, businesses, employees, punctuality } from '../db/schema';
import { businessDate, formatDuration, hhmmssToMs, horaLimite, timeStrInTz } from '../core/time';
import { checkGps } from '../core/gps';
import { calcularMultaGanada, computeMulta, evalEntrada } from '../core/punctuality';

type Biz = typeof businesses.$inferSelect;
type Emp = typeof employees.$inferSelect;

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

export async function getClockContext(
  db: DB,
  token: string,
  now = new Date(),
): Promise<ClockContext | null> {
  const r = await resolve(db, token);
  if (!r) return null;
  const { emp, biz } = r;
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
  };
}

export async function clock(
  ctx: ClockCtx,
  input: { token: string; lat?: number; lng?: number },
): Promise<ClockResult | null> {
  const { db } = ctx;
  const now = ctx.now ?? new Date();
  const r = await resolve(db, input.token);
  if (!r) return null;
  const { emp, biz } = r;

  const gps = checkGps(biz, input.lat, input.lng);
  if (biz.gpsRequerido && !gps.valido) {
    return { kind: 'fuera_de_rango', nombre: emp.nombre, distM: gps.dist ?? -1, radioM: biz.radioMetros };
  }

  const fecha = businessDate(now, biz.timezone, biz.dayCutoffHour);
  const existing = (
    await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, emp.id), eq(attendance.fecha, fecha)))
      .limit(1)
  )[0];

  // ── ENTRADA ──────────────────────────────────────────────────────────────
  if (!existing) {
    const hora = timeStrInTz(now, biz.timezone);
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

    if (ev.estado === 'TARDE') {
      // La entrada ya quedó registrada; pedimos el motivo para cerrar la multa.
      const multa = computeMulta(ev.minTarde, biz.multaPorMin);
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
      minTarde: 0,
      minTemprano: ev.minTemprano,
      nivel: ev.medal ? `${ev.medal.emoji} ${ev.medal.nombre}` : '⏰ A tiempo',
      puntos: ev.medal?.puntos ?? 0,
      multaPagada: 0,
    });

    return {
      kind: 'entrada',
      nombre: emp.nombre,
      fecha,
      horaEntrada: hora,
      estado: ev.estado,
      minTemprano: ev.minTemprano,
      medal: ev.medal,
    };
  }

  // ── Ya tiene entrada ───────────────────────────────────────────────────────
  if (existing.salidaAt || existing.horaSalida) {
    return { kind: 'completo', nombre: emp.nombre, fecha };
  }

  // ── SALIDA ─────────────────────────────────────────────────────────────────
  if (existing.entradaAt) {
    const diffMin = Math.floor((now.getTime() - new Date(existing.entradaAt).getTime()) / 60000);
    if (diffMin < MIN_MINUTES_BETWEEN_ENTRY_EXIT) {
      return {
        kind: 'espera',
        nombre: emp.nombre,
        minutosRestantes: MIN_MINUTES_BETWEEN_ENTRY_EXIT - diffMin,
      };
    }
  }

  const horaSalida = timeStrInTz(now, biz.timezone);
  const horasTxt = existing.entradaAt
    ? formatDuration(now.getTime() - new Date(existing.entradaAt).getTime())
    : '';

  await db
    .update(attendance)
    .set({ horaSalida, salidaAt: now, horasTrabajadas: horasTxt })
    .where(eq(attendance.id, existing.id));

  return {
    kind: 'salida',
    nombre: emp.nombre,
    fecha,
    horaEntrada: existing.horaEntrada ?? '',
    horaSalida,
    horasTrabajadas: horasTxt,
    estado: existing.estado,
    minTarde: existing.minTarde,
  };
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
  const row = (
    await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, emp.id), eq(attendance.fecha, fecha)))
      .limit(1)
  )[0];
  if (!row) return null;

  await db.update(attendance).set({ motivoTarde: input.motivo }).where(eq(attendance.id, row.id));

  const hora = row.horaEntrada ?? timeStrInTz(now, biz.timezone);
  const multa = computeMulta(row.minTarde, biz.multaPorMin);
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

  return { kind: 'entrada', nombre: emp.nombre, fecha, horaEntrada: hora, estado: 'TARDE', minTemprano: 0, medal: null };
}

interface PuntInput {
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

async function registrarPuntualidad(db: DB, p: PuntInput): Promise<void> {
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
