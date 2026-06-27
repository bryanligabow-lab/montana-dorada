import type { MedalLevel } from './types';

/** Escala de medallas por minutos de adelanto (orden descendente). */
export const MEDAL_LEVELS: MedalLevel[] = [
  { key: 'diamante', minDesde: 30, nombre: 'Diamante', emoji: '💎', puntos: 10, color: '#06B6D4', bg: 'rgba(6,182,212,.15)' },
  { key: 'oro', minDesde: 15, nombre: 'Oro', emoji: '🥇', puntos: 5, color: '#F59E0B', bg: 'rgba(245,158,11,.15)' },
  { key: 'plata', minDesde: 5, nombre: 'Plata', emoji: '🥈', puntos: 3, color: '#CBD5E1', bg: 'rgba(203,213,225,.15)' },
  { key: 'bronce', minDesde: 1, nombre: 'Bronce', emoji: '🥉', puntos: 1, color: '#D97706', bg: 'rgba(217,119,6,.15)' },
];

/** Devuelve la medalla que corresponde a `minTemprano` minutos de adelanto, o null. */
export function medalFor(minTemprano: number): MedalLevel | null {
  if (!minTemprano || minTemprano < 1) return null;
  for (const lvl of MEDAL_LEVELS) if (minTemprano >= lvl.minDesde) return lvl;
  return null;
}

export const MOTIVOS_TARDANZA = [
  'Tráfico',
  'Transporte',
  'Salud',
  'Personal',
  'Trabajo anterior',
  'Otro',
] as const;

/** Valores por defecto para un negocio nuevo (heredados del sistema GinitaFruits). */
export const DEFAULT_BUSINESS = {
  timezone: 'America/Guayaquil',
  radioMetros: 80,
  horaEntradaLv: '08:00:00',
  horaEntradaFds: '08:00:00',
  multaPorMin: 0.1,
  dayCutoffHour: 2,
  gpsRequerido: true,
} as const;

/** Ventana anti-duplicado de escaneo (segundos). */
export const DUPLICATE_WINDOW_SECONDS = 60;
/** Minutos mínimos entre entrada y salida. */
export const MIN_MINUTES_BETWEEN_ENTRY_EXIT = 5;
