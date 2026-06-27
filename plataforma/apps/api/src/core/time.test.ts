import { describe, expect, it } from 'vitest';
import { businessDate, formatDuration, hhmmssToMs, timeStrInTz } from './time';

const TZ = 'America/Guayaquil'; // UTC-5, sin horario de verano

describe('businessDate (corte 02:00)', () => {
  it('antes del corte cuenta como el día anterior', () => {
    // 06:30 UTC = 01:30 en Ecuador → antes de las 02:00
    expect(businessDate(new Date('2026-06-27T06:30:00Z'), TZ, 2)).toBe('2026-06-26');
  });

  it('después del corte cuenta como el día actual', () => {
    // 08:00 UTC = 03:00 en Ecuador → 03:00 >= 02:00
    expect(businessDate(new Date('2026-06-27T08:00:00Z'), TZ, 2)).toBe('2026-06-27');
  });

  it('última noche cuenta el día que arrancó', () => {
    // 04:59 UTC = 23:59 del 26 en Ecuador
    expect(businessDate(new Date('2026-06-27T04:59:00Z'), TZ, 2)).toBe('2026-06-26');
  });
});

describe('timeStrInTz', () => {
  it('convierte a la hora local del negocio', () => {
    expect(timeStrInTz(new Date('2026-06-27T13:05:09Z'), TZ)).toBe('08:05:09');
  });
});

describe('hhmmssToMs', () => {
  it('convierte HH:mm:ss a ms desde medianoche', () => {
    expect(hhmmssToMs('08:00:00')).toBe(28_800_000);
    expect(hhmmssToMs('00:01:00')).toBe(60_000);
  });
  it('devuelve null para vacío o inválido', () => {
    expect(hhmmssToMs('')).toBeNull();
    expect(hhmmssToMs(null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formatea como Xh YYm', () => {
    expect(formatDuration(3_600_000)).toBe('1h 00m');
    expect(formatDuration((8 * 3600 + 5 * 60) * 1000)).toBe('8h 05m');
  });
  it('vacío para duración inválida', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-1000)).toBe('');
  });
});
