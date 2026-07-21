import { and, eq, gte, lte } from 'drizzle-orm';
import type { PunctualitySummary } from '@asis/shared';
import type { DB } from '../db';
import { businesses, employees, punctuality } from '../db/schema';
import { businessDate, fechaDisplay } from '../core/time';
import { sendMail } from './mailer';
import { sendWhatsApp } from './whatsapp';
import { env } from '../env';

type Biz = typeof businesses.$inferSelect;
export type ReporteTipo = 'DIARIO' | 'SEMANAL' | 'MENSUAL';

const fmt = (d: Date): string => d.toISOString().slice(0, 10);

/** Rango (día operativo) que cubre cada tipo de reporte, relativo a hoy. */
export function rangoReporte(
  tipo: ReporteTipo,
  b: Biz,
  now = new Date(),
): { from: string; to: string; label: string } {
  const hoy = businessDate(now, b.timezone, b.dayCutoffHour);
  const d = new Date(`${hoy}T00:00:00Z`);

  if (tipo === 'DIARIO') {
    const ayer = new Date(d);
    ayer.setUTCDate(d.getUTCDate() - 1);
    const f = fmt(ayer);
    return { from: f, to: f, label: fechaDisplay(f) };
  }

  if (tipo === 'SEMANAL') {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
    const lunesEsta = new Date(d);
    lunesEsta.setUTCDate(d.getUTCDate() - dow);
    const lunesPasada = new Date(lunesEsta);
    lunesPasada.setUTCDate(lunesEsta.getUTCDate() - 7);
    const domingoPasado = new Date(lunesEsta);
    domingoPasado.setUTCDate(lunesEsta.getUTCDate() - 1);
    return {
      from: fmt(lunesPasada),
      to: fmt(domingoPasado),
      label: `${fechaDisplay(fmt(lunesPasada))} – ${fechaDisplay(fmt(domingoPasado))}`,
    };
  }

  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return {
    from: fmt(first),
    to: fmt(last),
    label: `${fechaDisplay(fmt(first))} – ${fechaDisplay(fmt(last))}`,
  };
}

async function resumen(db: DB, businessId: string, from: string, to: string): Promise<PunctualitySummary[]> {
  const emps = await db.select().from(employees).where(eq(employees.businessId, businessId));
  const punts = await db
    .select()
    .from(punctuality)
    .where(and(eq(punctuality.businessId, businessId), gte(punctuality.fecha, from), lte(punctuality.fecha, to)));

  const byId = new Map<string, PunctualitySummary>();
  for (const e of emps) {
    byId.set(e.id, {
      employeeId: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      dias: 0,
      tempranos: 0,
      tardanzas: 0,
      puntos: 0,
      multaPagada: 0,
      multaGanada: 0,
    });
  }
  for (const p of punts) {
    const s = byId.get(p.employeeId);
    if (!s) continue;
    s.dias++;
    s.puntos += p.puntos;
    s.multaPagada += p.multaPagada;
    s.multaGanada += p.multaGanada;
    if (p.minTarde > 0) s.tardanzas++;
    if (p.minTemprano > 0) s.tempranos++;
  }
  return [...byId.values()].sort((a, b) => b.puntos - a.puntos);
}

const TIPO_LABEL: Record<ReporteTipo, string> = {
  DIARIO: 'Reporte diario de asistencia',
  SEMANAL: 'Reporte semanal de asistencia',
  MENSUAL: 'Reporte mensual de asistencia',
};

/** Correo profesional (tema claro, compatible con Gmail/Outlook: tablas + estilos en línea). */
export function buildHtml(b: Biz, tipo: ReporteTipo, label: string, rows: PunctualitySummary[]): string {
  const primary = b.branding.primary || '#43A047';
  const logo = b.branding.logoUrl
    ? `<img src="${esc(b.branding.logoUrl)}" alt="" height="40" style="height:40px;display:block;margin-bottom:8px" />`
    : '';

  const totalEmp = rows.length;
  const totalDias = rows.reduce((s, r) => s + r.dias, 0);
  const totalTarde = rows.reduce((s, r) => s + r.tardanzas, 0);
  const totalMulta = rows.reduce((s, r) => s + r.multaPagada, 0);

  const tile = (valor: string, etiqueta: string, color = '#111827') => `
    <td width="25%" style="padding:6px" valign="top">
      <div style="background:#f6f7f9;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:${color};line-height:1.1">${valor}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${etiqueta}</div>
      </div>
    </td>`;

  const fila = (r: PunctualitySummary, i: number) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:#9ca3af">${i + 1}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f2"><b style="color:#111827">${esc(r.nombre)}</b><br><span style="color:#9ca3af;font-size:11px">${esc(r.codigo)}</span></td>
      <td align="center" style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:#374151">${r.dias}</td>
      <td align="center" style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:#16a34a;font-weight:700">${r.tempranos}</td>
      <td align="center" style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:${r.tardanzas > 0 ? '#dc2626' : '#9ca3af'};font-weight:700">${r.tardanzas}</td>
      <td align="right" style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:#374151">$${r.multaPagada.toFixed(2)}</td>
      <td align="right" style="padding:10px 8px;border-bottom:1px solid #eef0f2;color:#374151">$${r.multaGanada.toFixed(2)}</td>
      <td align="right" style="padding:10px 8px;border-bottom:1px solid #eef0f2"><b style="color:${primary}">${r.puntos}</b></td>
    </tr>`;

  const cuerpo = rows.length
    ? rows.map(fila).join('')
    : `<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">Sin marcaciones en el período.</td></tr>`;

  return `<div style="background:#eceef1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:660px;margin:0 auto">
      <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden">

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:${primary};padding:24px 28px">
            ${logo}
            <div style="color:#ffffff;font-size:20px;font-weight:800;line-height:1.2">${esc(b.nombre)}</div>
            <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">${TIPO_LABEL[tipo]}</div>
            <div style="color:#ffffff;font-size:15px;font-weight:700;margin-top:2px">${esc(label)}</div>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:16px 22px 4px">
          <tr>
            ${tile(String(totalEmp), 'Empleados')}
            ${tile(String(totalDias), 'Días marcados')}
            ${tile(String(totalTarde), 'Tardanzas', totalTarde > 0 ? '#dc2626' : '#111827')}
            ${tile('$' + totalMulta.toFixed(2), 'Multas cobradas')}
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:8px 20px 20px">
          <tr><td>
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">
              <tr style="color:#9ca3af;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em">
                <th style="padding:8px">#</th><th style="padding:8px">Empleado</th>
                <th style="padding:8px" align="center">Días</th><th style="padding:8px" align="center">Temp.</th><th style="padding:8px" align="center">Tarde</th>
                <th style="padding:8px" align="right">Pagó</th><th style="padding:8px" align="right">Ganó</th><th style="padding:8px" align="right">Puntos</th>
              </tr>
              ${cuerpo}
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:#f6f7f9;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;border-top:1px solid #eef0f2">
            Reporte automático de asistencia · ${esc(b.nombre)}<br>
            Generado por la Plataforma de Asistencia. No es necesario responder a este correo.
          </td></tr>
        </table>

      </td></tr>
    </table>
  </div>`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MAX_FILAS_WHATSAPP = 15;

function buildText(b: Biz, tipo: ReporteTipo, label: string, rows: PunctualitySummary[]): string {
  const filas = rows
    .slice(0, MAX_FILAS_WHATSAPP)
    .map(
      (r, i) =>
        `${i + 1}. ${r.nombre} — ${r.dias}d · ${r.tempranos} temp · ${r.tardanzas} tarde · $${r.multaPagada.toFixed(2)} pagó · ${r.puntos}pts`,
    )
    .join('\n');
  const resto = rows.length > MAX_FILAS_WHATSAPP ? `\n…y ${rows.length - MAX_FILAS_WHATSAPP} más` : '';
  return `📊 REPORTE ${tipo} · ${b.nombre}\n${label}\n\n${filas || '(sin marcaciones)'}${resto}`;
}

export async function runReporte(db: DB, b: Biz, tipo: ReporteTipo): Promise<boolean> {
  const { from, to, label } = rangoReporte(tipo, b);
  const rows = await resumen(db, b.id, from, to);
  const to_ = b.reportEmails.length ? b.reportEmails : env.reportEmails;
  const html = buildHtml(b, tipo, label, rows);

  const resultados = await Promise.allSettled([
    sendMail({ to: to_, subject: `${TIPO_LABEL[tipo]} · ${b.nombre} · ${label}`, html }),
    ...b.reportWhatsapp.map((numero) => sendWhatsApp(buildText(b, tipo, label, rows), numero)),
  ]);
  return resultados.some((r) => r.status === 'fulfilled' && r.value === true);
}
