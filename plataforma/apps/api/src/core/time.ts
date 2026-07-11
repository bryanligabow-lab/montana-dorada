// Manejo de fecha/hora en la zona horaria del negocio, sin dependencias.
// Reemplaza Utilities.formatDate(date, ZONA, ...) de Apps Script usando Intl.
import type { WeekSchedule } from '@asis/shared';

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = domingo … 6 = sábado */
  weekdayIdx: number;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partsInTz(date: Date, tz: string): TzParts {
  const m: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(date)) {
    if (p.type !== 'literal') m[p.type] = p.value;
  }
  let hour = Number(m.hour);
  if (hour === 24) hour = 0; // algunos entornos devuelven 24 a medianoche
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour,
    minute: Number(m.minute),
    second: Number(m.second),
    weekdayIdx: WEEKDAY[m.weekday ?? 'Sun'] ?? 0,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function timeStrInTz(date: Date, tz: string): string {
  const p = partsInTz(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/**
 * Día operativo en formato 'yyyy-MM-dd'. Si la hora local es anterior a
 * `cutoffHour`, cuenta como el día anterior (corte 02:00 por defecto).
 */
export function businessDate(now: Date, tz: string, cutoffHour: number): string {
  const p = partsInTz(now, tz);
  let { year, month, day } = p;
  if (p.hour < cutoffHour) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() - 1);
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 'dd/MM/yyyy' a partir de un día operativo 'yyyy-MM-dd' (para mostrar). */
export function fechaDisplay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}

export function isWeekend(date: Date, tz: string): boolean {
  const w = partsInTz(date, tz).weekdayIdx;
  return w === 0 || w === 6;
}

/** `weekdayIdx` (0=domingo…6=sábado) a la clave del día en `WeekSchedule`. */
const WEEKDAY_KEY = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

export function horaLimite(b: { horarios: WeekSchedule; timezone: string }, now: Date): string {
  const key = WEEKDAY_KEY[partsInTz(now, b.timezone).weekdayIdx]!;
  return b.horarios[key];
}

/** Convierte 'HH:mm:ss' a milisegundos desde medianoche. */
export function hhmmssToMs(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const parts = String(hora).trim().split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const h = parts[0]!;
  const m = parts[1]!;
  const s = parts[2] ?? 0;
  return ((h * 60 + m) * 60 + s) * 1000;
}

/** Formatea una duración en ms como 'Xh YYm'. */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '';
  const totalMin = Math.floor(ms / 60000);
  return `${Math.floor(totalMin / 60)}h ${pad(totalMin % 60)}m`;
}
