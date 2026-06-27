import { medalFor } from '@asis/shared';
import type { AttendanceState, MedalLevel } from '@asis/shared';

export interface EntryEval {
  estado: AttendanceState;
  minTarde: number;
  minTemprano: number;
  medal: MedalLevel | null;
}

/** Evalúa una entrada comparando la hora de marcación con la hora límite (en ms). */
export function evalEntrada(horaActualMs: number, limiteMs: number): EntryEval {
  const tarde = horaActualMs > limiteMs;
  const temprano = horaActualMs < limiteMs;
  const minTarde = tarde ? Math.max(0, Math.round((horaActualMs - limiteMs) / 60000)) : 0;
  const minTemprano = temprano ? Math.max(0, Math.round((limiteMs - horaActualMs) / 60000)) : 0;
  const estado: AttendanceState = tarde ? 'TARDE' : temprano ? 'TEMPRANO' : 'A_TIEMPO';
  return { estado, minTarde, minTemprano, medal: medalFor(minTemprano) };
}

export function computeMulta(minTarde: number, multaPorMin: number): number {
  return Math.round(minTarde * multaPorMin * 100) / 100;
}

/**
 * Reparte el pozo de multas del día: todo lo pagado va a quien(es) marcó(aron)
 * más temprano. Devuelve la multa ganada por cada fila, en el mismo orden.
 */
export function calcularMultaGanada(
  rows: { horaEntradaMs: number | null; multaPagada: number }[],
): number[] {
  const ganada = rows.map(() => 0);
  const pot = rows.reduce((a, r) => a + (r.multaPagada || 0), 0);
  if (pot <= 0) return ganada;

  let menor = Infinity;
  for (const r of rows) {
    if (r.horaEntradaMs != null && r.horaEntradaMs < menor) menor = r.horaEntradaMs;
  }
  if (menor === Infinity) return ganada;

  const winners = rows.map((r, i) => (r.horaEntradaMs === menor ? i : -1)).filter((i) => i >= 0);
  const reparto = Math.round((pot / winners.length) * 100) / 100;
  for (const i of winners) ganada[i] = reparto;
  return ganada;
}
