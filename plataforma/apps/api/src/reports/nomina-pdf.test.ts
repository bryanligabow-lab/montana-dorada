import { describe, expect, it } from 'vitest';
import type { NominaRow } from '@asis/shared';
import { pdfNominaNegocio, pdfReciboEmpleado } from './nomina-pdf';

const row: NominaRow = {
  employeeId: 'e1',
  codigo: 'E1',
  nombre: 'Empleado Uno',
  tipoSueldo: 'FIJO',
  diasTrabajados: 20,
  sueldoBase: 400,
  horasNormales: 160,
  horasExtra: 5,
  pagoHoraExtra: 18.75,
  multaPagada: 2,
  multaGanada: 0,
  anticipos: 50,
  multaManual: 10,
  totalARecibir: 356.75,
};

const opts = { negocio: 'Negocio Test', desde: '2026-07-01', hasta: '2026-07-31', primary: '#43A047' };

/** Los primeros bytes de un PDF válido son '%PDF'. */
function esPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

describe('generación de PDF de nómina', () => {
  it('el recibo individual produce un PDF válido y no vacío', async () => {
    const pdf = await pdfReciboEmpleado(row, opts);
    expect(esPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('el informe del negocio produce un PDF válido con varias filas', async () => {
    const rows = [row, { ...row, employeeId: 'e2', codigo: 'E2', nombre: 'Empleado Dos', totalARecibir: 300 }];
    const pdf = await pdfNominaNegocio(rows, opts);
    expect(esPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('no rompe con un color de marca inválido', async () => {
    const pdf = await pdfReciboEmpleado(row, { ...opts, primary: 'no-es-color' });
    expect(esPdf(pdf)).toBe(true);
  });
});
