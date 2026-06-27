import { describe, expect, it } from 'vitest';
import { medalFor, MEDAL_LEVELS } from './constants';

describe('medalFor', () => {
  it('no da medalla por llegar a tiempo o tarde', () => {
    expect(medalFor(0)).toBeNull();
    expect(medalFor(-5)).toBeNull();
  });

  it('asigna el nivel correcto por minutos de adelanto', () => {
    expect(medalFor(1)?.key).toBe('bronce');
    expect(medalFor(4)?.key).toBe('bronce');
    expect(medalFor(5)?.key).toBe('plata');
    expect(medalFor(14)?.key).toBe('plata');
    expect(medalFor(15)?.key).toBe('oro');
    expect(medalFor(29)?.key).toBe('oro');
    expect(medalFor(30)?.key).toBe('diamante');
    expect(medalFor(120)?.key).toBe('diamante');
  });

  it('los niveles están ordenados de mayor a menor umbral', () => {
    const umbrales = MEDAL_LEVELS.map((m) => m.minDesde);
    expect(umbrales).toEqual([...umbrales].sort((a, b) => b - a));
  });
});
