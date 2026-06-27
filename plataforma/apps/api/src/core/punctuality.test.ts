import { describe, expect, it } from 'vitest';
import { calcularMultaGanada, computeMulta, evalEntrada } from './punctuality';
import { hhmmssToMs } from './time';

const LIMITE = hhmmssToMs('08:00:00')!;

describe('evalEntrada', () => {
  it('temprano 15 min → medalla oro', () => {
    const r = evalEntrada(hhmmssToMs('07:45:00')!, LIMITE);
    expect(r.estado).toBe('TEMPRANO');
    expect(r.minTemprano).toBe(15);
    expect(r.medal?.key).toBe('oro');
  });

  it('justo a la hora → a tiempo, sin medalla', () => {
    const r = evalEntrada(LIMITE, LIMITE);
    expect(r.estado).toBe('A_TIEMPO');
    expect(r.minTarde).toBe(0);
    expect(r.medal).toBeNull();
  });

  it('10 min tarde', () => {
    const r = evalEntrada(hhmmssToMs('08:10:00')!, LIMITE);
    expect(r.estado).toBe('TARDE');
    expect(r.minTarde).toBe(10);
  });
});

describe('computeMulta', () => {
  it('$0.10 por minuto, redondeado a centavos', () => {
    expect(computeMulta(10, 0.1)).toBe(1);
    expect(computeMulta(7, 0.1)).toBe(0.7);
  });
});

describe('calcularMultaGanada (pozo al más temprano)', () => {
  it('todo el pozo va al que llegó más temprano', () => {
    const rows = [
      { horaEntradaMs: hhmmssToMs('08:10:00'), multaPagada: 1 },
      { horaEntradaMs: hhmmssToMs('07:45:00'), multaPagada: 0 },
      { horaEntradaMs: hhmmssToMs('08:30:00'), multaPagada: 2 },
    ];
    expect(calcularMultaGanada(rows)).toEqual([0, 3, 0]);
  });

  it('empate: se reparte entre los más tempranos', () => {
    const rows = [
      { horaEntradaMs: hhmmssToMs('07:45:00'), multaPagada: 1 },
      { horaEntradaMs: hhmmssToMs('07:45:00'), multaPagada: 0 },
      { horaEntradaMs: hhmmssToMs('09:00:00'), multaPagada: 2 },
    ];
    expect(calcularMultaGanada(rows)).toEqual([1.5, 1.5, 0]);
  });

  it('sin multas pagadas, nadie gana', () => {
    const rows = [
      { horaEntradaMs: hhmmssToMs('07:45:00'), multaPagada: 0 },
      { horaEntradaMs: hhmmssToMs('08:00:00'), multaPagada: 0 },
    ];
    expect(calcularMultaGanada(rows)).toEqual([0, 0]);
  });
});
