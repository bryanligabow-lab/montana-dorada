import cron from 'node-cron';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env';
import { getDb } from '../db';
import { attendance, businesses, employees } from '../db/schema';
import { businessDate, hhmmssToMs, msLocalDelDia, scheduleKeyForFecha } from '../core/time';
import { sendWhatsApp } from './whatsapp';

/** Evita reenviar el recordatorio: por negocio, guarda la última fecha en que ya se envió. */
const ultimoEnvio = new Map<string, string>();

/**
 * Recordatorio de salida: cada minuto revisa qué negocios tienen la salida cerca y
 * avisa por WhatsApp (al teléfono de cada empleado) a quienes entraron pero aún no marcaron salida.
 * Se envía una sola vez por negocio y día, dentro de la ventana [salida − N min, salida).
 */
export function startReminderCron(log: FastifyBaseLogger): void {
  if (!env.evolution.url || !env.evolution.key || !env.evolution.instance) {
    log.warn('Recordatorio de salida deshabilitado (WhatsApp/Evolution no configurado).');
    return;
  }
  cron.schedule('* * * * *', () => void tick(log));
  log.info('Cron de recordatorio de salida activado (cada minuto).');
}

async function tick(log: FastifyBaseLogger): Promise<void> {
  const now = new Date();
  const db = await getDb();
  const negocios = await db.select().from(businesses);

  for (const b of negocios) {
    if (!b.activo || !b.recordatorioSalidaActivo) continue;
    try {
      const fecha = businessDate(now, b.timezone, b.dayCutoffHour);
      if (ultimoEnvio.get(b.id) === fecha) continue; // ya se envió hoy

      const salidaHora = b.horariosSalida[scheduleKeyForFecha(fecha)];
      const salidaMs = hhmmssToMs(salidaHora);
      if (salidaMs == null || salidaMs <= 0) continue; // día sin salida definida

      const nowMs = msLocalDelDia(now, b.timezone);
      const reminderMs = salidaMs - b.recordatorioSalidaMin * 60_000;
      // Ventana: desde N min antes hasta la hora de salida (no después).
      if (nowMs < reminderMs || nowMs >= salidaMs) continue;

      const enviados = await enviarRecordatorios(db, b.id, fecha, salidaHora);
      ultimoEnvio.set(b.id, fecha); // marca el día como enviado aunque no haya destinatarios
      if (enviados > 0) log.info(`Recordatorio de salida (${b.nombre}): ${enviados} enviado(s).`);
    } catch (e) {
      log.error({ err: e }, `Error en recordatorio de salida de ${b.nombre}`);
    }
  }
}

/** Envía el recordatorio a cada empleado ACTIVO con teléfono que entró hoy y no ha marcado salida. */
async function enviarRecordatorios(
  db: Awaited<ReturnType<typeof getDb>>,
  bizId: string,
  fecha: string,
  salidaHora: string,
): Promise<number> {
  const abiertos = await db
    .select({
      nombre: employees.nombre,
      telefono: employees.telefono,
      estado: employees.estado,
    })
    .from(attendance)
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .where(
      and(
        eq(attendance.businessId, bizId),
        eq(attendance.fecha, fecha),
        isNull(attendance.salidaAt),
        isNull(attendance.horaSalida),
      ),
    );

  const hhmm = salidaHora.slice(0, 5);
  let enviados = 0;
  const envios = abiertos
    .filter((e) => e.estado === 'ACTIVO' && e.telefono && (e.telefono ?? '').trim().length >= 6)
    .map(async (e) => {
      const text =
        `⏰ Recordatorio: tu hora de salida es a las ${hhmm}.\n` +
        `No olvides marcar tu *SALIDA* en el sistema antes de irte, ${e.nombre.split(' ')[0]}. 🙏`;
      if (await sendWhatsApp(text, e.telefono!.trim())) enviados++;
    });
  await Promise.allSettled(envios);
  return enviados;
}
