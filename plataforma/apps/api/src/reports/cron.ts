import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env';
import { getDb } from '../db';
import { businesses } from '../db/schema';
import { runReporte, type ReporteTipo } from './report';

const TZ = 'America/Guayaquil';

export function startReportCron(log: FastifyBaseLogger): void {
  if (!env.smtp.host) {
    log.warn('Reportes por correo deshabilitados (SMTP no configurado).');
    return;
  }
  // Diario 06:00 · Semanal lunes 06:00 · Mensual día 1 06:00.
  cron.schedule('0 6 * * *', () => void runAll('DIARIO', log), { timezone: TZ });
  cron.schedule('0 6 * * 1', () => void runAll('SEMANAL', log), { timezone: TZ });
  cron.schedule('0 6 1 * *', () => void runAll('MENSUAL', log), { timezone: TZ });
  log.info('Cron de reportes activado (zona ' + TZ + ').');
}

async function runAll(tipo: ReporteTipo, log: FastifyBaseLogger): Promise<void> {
  const db = await getDb();
  const all = await db.select().from(businesses);
  for (const b of all) {
    try {
      const enviado = await runReporte(db, b, tipo);
      log.info(`Reporte ${tipo} de ${b.nombre}: ${enviado ? 'enviado' : 'omitido'}`);
    } catch (e) {
      log.error({ err: e }, `Error en reporte ${tipo} de ${b.nombre}`);
    }
  }
}
