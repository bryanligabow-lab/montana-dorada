import { and, eq, gte, lte } from 'drizzle-orm';
import type { PunctualitySummary } from '@asis/shared';
import type { DB } from '../db';
import { businesses, employees, punctuality } from '../db/schema';
import { businessDate, fechaDisplay } from '../core/time';
import { sendMail } from './mailer';
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

function buildHtml(b: Biz, tipo: ReporteTipo, label: string, rows: PunctualitySummary[]): string {
  const c = b.branding;
  const fila = (r: PunctualitySummary, i: number) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #2222">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #2222"><b>${esc(r.nombre)}</b><br><span style="color:#888;font-size:11px">${esc(r.codigo)}</span></td>
      <td align="center" style="padding:8px;border-bottom:1px solid #2222">${r.dias}</td>
      <td align="center" style="padding:8px;border-bottom:1px solid #2222;color:${c.primary}">${r.tempranos}</td>
      <td align="center" style="padding:8px;border-bottom:1px solid #2222;color:${c.accent}">${r.tardanzas}</td>
      <td align="right" style="padding:8px;border-bottom:1px solid #2222">$${r.multaPagada.toFixed(2)}</td>
      <td align="right" style="padding:8px;border-bottom:1px solid #2222">$${r.multaGanada.toFixed(2)}</td>
      <td align="right" style="padding:8px;border-bottom:1px solid #2222"><b>${r.puntos}</b></td>
    </tr>`;
  return `<div style="font-family:Arial,sans-serif;background:${c.bg};color:#F1F1F1;padding:16px">
    <div style="max-width:760px;margin:0 auto;background:${c.card};border-radius:14px;overflow:hidden">
      <div style="padding:16px;border-bottom:1px solid #2222">
        <div style="color:${c.primary};font-weight:800;font-size:12px">${esc(b.nombre)} · REPORTE ${tipo}</div>
        <div style="font-size:18px;font-weight:800">${esc(label)}</div>
      </div>
      <div style="padding:12px;overflow:auto">
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:13px">
          <tr style="color:#999;text-align:left">
            <th style="padding:8px">#</th><th style="padding:8px">Empleado</th>
            <th style="padding:8px">Días</th><th style="padding:8px">Temp.</th><th style="padding:8px">Tarde</th>
            <th style="padding:8px" align="right">Pagó</th><th style="padding:8px" align="right">Ganó</th><th style="padding:8px" align="right">Puntos</th>
          </tr>
          ${rows.map(fila).join('')}
        </table>
      </div>
    </div>
  </div>`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function runReporte(db: DB, b: Biz, tipo: ReporteTipo): Promise<boolean> {
  const { from, to, label } = rangoReporte(tipo, b);
  const rows = await resumen(db, b.id, from, to);
  const to_ = b.reportEmails.length ? b.reportEmails : env.reportEmails;
  const html = buildHtml(b, tipo, label, rows);
  return sendMail({ to: to_, subject: `Reporte ${tipo} · ${b.nombre} · ${label}`, html });
}
