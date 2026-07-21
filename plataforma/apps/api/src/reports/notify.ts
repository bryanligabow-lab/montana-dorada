import type { ClockResult } from '@asis/shared';
import { env } from '../env';
import { sendMail } from './mailer';
import { sendWhatsApp } from './whatsapp';

/** Temprano/tarde/a tiempo con los minutos de diferencia, para que se sepa a simple vista. */
function estadoConMinutos(r: Extract<ClockResult, { kind: 'entrada' }>): string {
  if (r.estado === 'TARDE') return `Tarde (${r.minTarde} min)`;
  if (r.estado === 'TEMPRANO') return `Temprano (${r.minTemprano} min)`;
  return 'A tiempo';
}

/** Línea corta que resume la marcación, o null si ese tipo no se notifica. */
export function resumenMarcacion(r: ClockResult): string | null {
  switch (r.kind) {
    case 'entrada':
      return `🟢 ENTRADA ${r.horaEntrada} · ${estadoConMinutos(r)}`;
    case 'salida':
      return `🔴 SALIDA ${r.horaSalida}${r.horasTrabajadas ? ` · ${r.horasTrabajadas}` : ''}`;
    case 'almuerzo_salida':
      return `🍽️ ALMUERZO — salió ${r.hora}`;
    case 'almuerzo_regreso':
      return `↩️ ALMUERZO — regresó ${r.hora}`;
    default:
      return null;
  }
}

/** Notifica una marcación por correo y WhatsApp (fire-and-forget desde el caller). */
export async function notifyMarcacion(opts: {
  negocio: string;
  empleado: string;
  codigo: string;
  reportEmails: string[];
  /** Grupo de WhatsApp del negocio (JID o número). Vacío = no se notifica por WhatsApp. */
  whatsappGrupoId: string;
  result: ClockResult;
}): Promise<void> {
  const linea = resumenMarcacion(opts.result);
  if (!linea) return;

  const text = `${linea}\n👤 ${opts.empleado} (${opts.codigo})\n🏢 ${opts.negocio}`;
  const to = opts.reportEmails.length ? opts.reportEmails : env.reportEmails;

  await Promise.allSettled([
    sendMail({
      to,
      subject: `${linea} — ${opts.empleado}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${text.replace(/\n/g, '<br>')}</div>`,
      text,
    }),
    opts.whatsappGrupoId ? sendWhatsApp(text, opts.whatsappGrupoId) : Promise.resolve(false),
  ]);
}
