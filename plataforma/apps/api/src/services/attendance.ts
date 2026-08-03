import { and, eq } from 'drizzle-orm';
import type { AttendanceUpdateInput } from '@asis/shared';
import type { DB } from '../db';
import { attendance, businesses, employees, punctuality } from '../db/schema';
import { computeMulta, evalEntrada } from '../core/punctuality';
import { formatDuration, hhmmssToMs, scheduleKeyForFecha, zonedTimeToUtc } from '../core/time';
import { recalcPozoDia, registrarPuntualidad } from './clock';

type Att = typeof attendance.$inferSelect;

export async function findAttendance(db: DB, id: string): Promise<Att | null> {
  return (await db.select().from(attendance).where(eq(attendance.id, id)).limit(1))[0] ?? null;
}

/**
 * Corrige un registro de asistencia cargado desde el panel (horas mal marcadas o incompletas).
 * Si cambia la entrada, recalcula estado/minTarde de la fila y la puntualidad (multa/medalla)
 * del día completo — mismo camino que usa la marcación en vivo, para no desincronizar
 * Ranking/Nómina del cambio.
 */
export async function updateAttendanceRecord(db: DB, row: Att, patch: AttendanceUpdateInput): Promise<Att> {
  const biz = (await db.select().from(businesses).where(eq(businesses.id, row.businessId)).limit(1))[0]!;
  const emp = (await db.select().from(employees).where(eq(employees.id, row.employeeId)).limit(1))[0]!;

  const set: Partial<typeof attendance.$inferInsert> = {};
  if (patch.horaEntrada !== undefined) {
    set.horaEntrada = patch.horaEntrada;
    set.entradaAt = zonedTimeToUtc(row.fecha, patch.horaEntrada, biz.timezone);
  }
  if (patch.horaSalida !== undefined) {
    set.horaSalida = patch.horaSalida;
    set.salidaAt = patch.horaSalida ? zonedTimeToUtc(row.fecha, patch.horaSalida, biz.timezone) : null;
    // El admin corrige la salida: pasa a ser autoritativa (deja de ser una salida manual pendiente).
    set.salidaManual = false;
    set.salidaAprob = null;
  }
  if (patch.horaAlmuerzoSalida !== undefined) {
    set.horaAlmuerzoSalida = patch.horaAlmuerzoSalida;
    set.almuerzoSalidaAt = patch.horaAlmuerzoSalida
      ? zonedTimeToUtc(row.fecha, patch.horaAlmuerzoSalida, biz.timezone)
      : null;
  }
  if (patch.horaAlmuerzoRegreso !== undefined) {
    set.horaAlmuerzoRegreso = patch.horaAlmuerzoRegreso;
    set.almuerzoRegresoAt = patch.horaAlmuerzoRegreso
      ? zonedTimeToUtc(row.fecha, patch.horaAlmuerzoRegreso, biz.timezone)
      : null;
  }

  // La entrada cambió: recalcula estado/minTarde de la fila y la puntualidad del día completo.
  if (patch.horaEntrada !== undefined) {
    const limite = biz.horarios[scheduleKeyForFecha(row.fecha)];
    const ev = evalEntrada(hhmmssToMs(patch.horaEntrada)!, hhmmssToMs(limite)!);
    set.estado = ev.estado;
    set.minTarde = ev.minTarde;

    const medal = biz.controlMedallas ? ev.medal : null;
    const multa =
      ev.estado === 'TARDE' && biz.controlMultas
        ? computeMulta(ev.minTarde, biz.multaMonto, biz.multaIntervaloMin)
        : 0;
    await registrarPuntualidad(db, {
      biz,
      emp,
      fecha: row.fecha,
      hora: patch.horaEntrada,
      minTarde: ev.estado === 'TARDE' ? ev.minTarde : 0,
      minTemprano: ev.minTemprano,
      nivel: medal ? `${medal.emoji} ${medal.nombre}` : ev.estado === 'TARDE' ? '⚠️ Tarde' : '⏰ A tiempo',
      puntos: medal?.puntos ?? 0,
      multaPagada: multa,
    });
  }

  // Recalcula horas trabajadas si cambió entrada, salida o almuerzo.
  const entradaAt = set.entradaAt !== undefined ? set.entradaAt : row.entradaAt;
  const salidaAt = set.salidaAt !== undefined ? set.salidaAt : row.salidaAt;
  const almSalidaAt = set.almuerzoSalidaAt !== undefined ? set.almuerzoSalidaAt : row.almuerzoSalidaAt;
  const almRegresoAt = set.almuerzoRegresoAt !== undefined ? set.almuerzoRegresoAt : row.almuerzoRegresoAt;
  if (entradaAt && salidaAt) {
    let ms = salidaAt.getTime() - entradaAt.getTime();
    if (almSalidaAt && almRegresoAt) ms -= almRegresoAt.getTime() - almSalidaAt.getTime();
    set.horasTrabajadas = ms > 0 ? formatDuration(ms) : '';
  }

  await db.update(attendance).set(set).where(eq(attendance.id, row.id));
  return (await db.select().from(attendance).where(eq(attendance.id, row.id)).limit(1))[0]!;
}

/**
 * Aprueba o rechaza una salida que el empleado registró manualmente (olvido de marcación).
 * - Aprobar: `salidaAprob='APROBADA'` (opcionalmente corrigiendo la hora declarada). A partir de aquí
 *   cuenta para las horas extra de la nómina.
 * - Rechazar: `salidaAprob='RECHAZADA'`. La salida queda registrada (para no re-pedirla) pero NO cuenta
 *   horas extra. El admin puede luego editar el registro para fijar la hora real.
 */
export async function aprobarSalida(
  db: DB,
  row: Att,
  aprobar: boolean,
  horaSalida?: string,
): Promise<Att> {
  const set: Partial<typeof attendance.$inferInsert> = {
    salidaAprob: aprobar ? 'APROBADA' : 'RECHAZADA',
  };

  // Aprobar corrigiendo la hora: recalcula salidaAt y horas trabajadas con la hora real.
  if (aprobar && horaSalida) {
    const biz = (await db.select().from(businesses).where(eq(businesses.id, row.businessId)).limit(1))[0]!;
    const salidaAt = zonedTimeToUtc(row.fecha, horaSalida, biz.timezone);
    set.horaSalida = horaSalida;
    set.salidaAt = salidaAt;
    if (row.entradaAt) {
      let ms = salidaAt.getTime() - new Date(row.entradaAt).getTime();
      if (row.almuerzoSalidaAt && row.almuerzoRegresoAt) {
        ms -= new Date(row.almuerzoRegresoAt).getTime() - new Date(row.almuerzoSalidaAt).getTime();
      }
      set.horasTrabajadas = ms > 0 ? formatDuration(ms) : '';
    }
  }

  await db.update(attendance).set(set).where(eq(attendance.id, row.id));
  return (await db.select().from(attendance).where(eq(attendance.id, row.id)).limit(1))[0]!;
}

/**
 * Elimina un registro de asistencia. `punctuality` no tiene FK hacia `attendance` (se
 * correlacionan por employeeId+fecha) — hay que borrar su fila aparte y recalcular el pozo
 * de multas del día para que no quede huérfana afectando a Ranking/Nómina.
 */
export async function deleteAttendanceRecord(db: DB, row: Att): Promise<void> {
  await db.delete(attendance).where(eq(attendance.id, row.id));
  await db
    .delete(punctuality)
    .where(and(eq(punctuality.employeeId, row.employeeId), eq(punctuality.fecha, row.fecha)));
  await recalcPozoDia(db, row.businessId, row.fecha);
}
