import { describe, expect, it } from 'vitest';
import type { ClockResult } from '@asis/shared';
import { resumenMarcacion } from './notify';

describe('resumenMarcacion — entrada', () => {
  it('tarde: muestra los minutos de tardanza, no la medalla', () => {
    const r: ClockResult = {
      kind: 'entrada',
      nombre: 'Ana',
      fecha: '2026-07-11',
      horaEntrada: '10:57:13',
      estado: 'TARDE',
      minTemprano: 0,
      minTarde: 177,
      medal: null,
    };
    expect(resumenMarcacion(r)).toBe('🟢 ENTRADA 10:57:13 · Tarde (177 min)');
  });

  it('temprano: muestra los minutos de anticipación, no "Diamante"', () => {
    const r: ClockResult = {
      kind: 'entrada',
      nombre: 'Ana',
      fecha: '2026-07-11',
      horaEntrada: '07:30:00',
      estado: 'TEMPRANO',
      minTemprano: 30,
      minTarde: 0,
      medal: { key: 'diamante', minDesde: 30, nombre: 'Diamante', emoji: '💎', puntos: 10, color: '#fff', bg: '#000' },
    };
    expect(resumenMarcacion(r)).toBe('🟢 ENTRADA 07:30:00 · Temprano (30 min)');
  });

  it('a tiempo: sin minutos', () => {
    const r: ClockResult = {
      kind: 'entrada',
      nombre: 'Ana',
      fecha: '2026-07-11',
      horaEntrada: '08:00:00',
      estado: 'A_TIEMPO',
      minTemprano: 0,
      minTarde: 0,
      medal: null,
    };
    expect(resumenMarcacion(r)).toBe('🟢 ENTRADA 08:00:00 · A tiempo');
  });
});
