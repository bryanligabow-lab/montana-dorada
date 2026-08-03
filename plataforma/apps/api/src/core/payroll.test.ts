import { describe, expect, it } from 'vitest';
import { calcularNominaEmpleado, diasEnRango } from './payroll';

const BIZ = {
  horarios: {
    lunes: '08:00:00',
    martes: '08:00:00',
    miercoles: '08:00:00',
    jueves: '08:00:00',
    viernes: '08:00:00',
    sabado: '08:00:00',
    domingo: '08:00:00',
  },
  horariosSalida: {
    lunes: '17:00:00',
    martes: '17:00:00',
    miercoles: '17:00:00',
    jueves: '17:00:00',
    viernes: '17:00:00',
    sabado: '17:00:00',
    domingo: '17:00:00',
  },
  controlAlmuerzo: true,
};

function emp(overrides: Partial<Parameters<typeof calcularNominaEmpleado>[0]> = {}) {
  return {
    id: 'e1',
    codigo: 'E1',
    nombre: 'Empleado',
    sueldo: 20,
    sueldoFds: 25,
    tipoSueldo: 'DIARIO' as const,
    sueldoFijo: 0,
    frecuenciaSueldo: 'MENSUAL' as const,
    horaExtraTipo: 'PORCENTAJE' as const,
    horaExtraValor: 0.5,
    ...overrides,
  };
}

// Lunes 2026-07-06, martes 2026-07-07 (entre semana).
function attDia(fecha: string, horaEntrada: string, horaSalida: string, conAlmuerzo = true) {
  return {
    fecha,
    entradaAt: new Date(`${fecha}T${horaEntrada}:00Z`),
    salidaAt: new Date(`${fecha}T${horaSalida}:00Z`),
    almuerzoSalidaAt: conAlmuerzo ? new Date(`${fecha}T12:00:00Z`) : null,
    almuerzoRegresoAt: conAlmuerzo ? new Date(`${fecha}T13:00:00Z`) : null,
  };
}

describe('diasEnRango', () => {
  it('cuenta los días de calendario inclusive', () => {
    expect(diasEnRango('2026-07-01', '2026-07-01')).toBe(1);
    expect(diasEnRango('2026-07-01', '2026-07-15')).toBe(15);
    expect(diasEnRango('2026-07-01', '2026-07-30')).toBe(30);
  });
});

describe('calcularNominaEmpleado — tipoSueldo DIARIO', () => {
  it('sin horas extra: sueldoBase = suma de sueldo/sueldoFds por día trabajado', () => {
    const att = [
      attDia('2026-07-06', '08:00', '17:00'), // lunes, jornada exacta (9h - 1h almuerzo = 8h)
      attDia('2026-07-07', '08:00', '17:00'), // martes
    ];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-06', '2026-07-07');
    expect(r.diasTrabajados).toBe(2);
    expect(r.sueldoBase).toBe(40); // 20 + 20
    expect(r.horasNormales).toBe(16);
    expect(r.horasExtra).toBe(0);
    expect(r.pagoHoraExtra).toBe(0);
    expect(r.totalARecibir).toBe(40);
  });

  it('usa sueldoFds el fin de semana (sábado 2026-07-11)', () => {
    const att = [attDia('2026-07-11', '08:00', '17:00')];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-11', '2026-07-11');
    expect(r.sueldoBase).toBe(25);
  });

  it('horas extra con recargo %: 2h extra a $2.5/h base y 50% de recargo = $7.5', () => {
    // Jornada esperada: 08:00-17:00 menos 1h almuerzo = 8h. Trabaja hasta 19:00 (10h - 1h = 9h → 1h extra... )
    // Para dejar el número redondo, trabaja hasta 20:00 (12h - 1h almuerzo = 11h trabajadas → 3h extra... )
    // Usamos 08:00-19:00 con almuerzo real 1h → trabajado = 10h; jornada = 8h → 2h extra.
    const att = [attDia('2026-07-06', '08:00', '19:00')];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-06', '2026-07-06');
    expect(r.horasNormales).toBe(8);
    expect(r.horasExtra).toBe(2);
    // tarifa/hora = 20/8 = 2.5; pago = 2h * 2.5 * 1.5 = 7.5
    expect(r.pagoHoraExtra).toBe(7.5);
    expect(r.totalARecibir).toBe(27.5); // 20 + 7.5
  });

  it('horas extra con monto fijo por hora, ignora la tarifa del empleado', () => {
    const att = [attDia('2026-07-06', '08:00', '19:00')]; // 2h extra
    const e = emp({ horaExtraTipo: 'FIJO', horaExtraValor: 3 });
    const r = calcularNominaEmpleado(e, BIZ, att, [], '2026-07-06', '2026-07-06');
    expect(r.pagoHoraExtra).toBe(6); // 2h * $3
    expect(r.totalARecibir).toBe(26); // 20 + 6
  });
});

describe('calcularNominaEmpleado — tipoSueldo FIJO', () => {
  it('paga el sueldoFijo completo cuando el rango es el mes calendario real, sin importar si tiene 28, 30 o 31 días', () => {
    const e = emp({ tipoSueldo: 'FIJO', sueldoFijo: 300, frecuenciaSueldo: 'MENSUAL' });
    const rJulio = calcularNominaEmpleado(e, BIZ, [], [], '2026-07-01', '2026-07-31'); // julio: 31 días
    expect(rJulio.sueldoBase).toBe(300);
    const rFebrero = calcularNominaEmpleado(e, BIZ, [], [], '2026-02-01', '2026-02-28'); // febrero 2026: 28 días
    expect(rFebrero.sueldoBase).toBe(300);
  });

  it('prorratea sueldoFijo mensual a un rango parcial usando los días reales del mes de "from"', () => {
    const e = emp({ tipoSueldo: 'FIJO', sueldoFijo: 310, frecuenciaSueldo: 'MENSUAL' });
    const r15 = calcularNominaEmpleado(e, BIZ, [], [], '2026-07-01', '2026-07-15'); // 15 de 31 días de julio
    expect(r15.sueldoBase).toBe(150); // 310 * 15/31
  });

  it('prorratea sueldoFijo quincenal (1-15 y 16-fin, aunque el mes tenga 31 días)', () => {
    const e = emp({ tipoSueldo: 'FIJO', sueldoFijo: 150, frecuenciaSueldo: 'QUINCENAL' });
    const rPrimera = calcularNominaEmpleado(e, BIZ, [], [], '2026-07-01', '2026-07-15'); // 15 días
    expect(rPrimera.sueldoBase).toBe(150);
    const rSegunda = calcularNominaEmpleado(e, BIZ, [], [], '2026-07-16', '2026-07-31'); // 16 días (julio tiene 31)
    expect(rSegunda.sueldoBase).toBe(150);
  });
});

describe('calcularNominaEmpleado — multas', () => {
  it('multaGanada suma y multaPagada resta del total', () => {
    const att = [attDia('2026-07-06', '08:00', '17:00')];
    const punt = [{ multaPagada: 5, multaGanada: 3 }];
    const r = calcularNominaEmpleado(emp(), BIZ, att, punt, '2026-07-06', '2026-07-06');
    expect(r.multaPagada).toBe(5);
    expect(r.multaGanada).toBe(3);
    expect(r.totalARecibir).toBe(18); // 20 + 3 - 5
  });
});

describe('calcularNominaEmpleado — anticipos y multas manuales', () => {
  it('los anticipos del rango se restan del total a recibir', () => {
    const att = [attDia('2026-07-06', '08:00', '17:00'), attDia('2026-07-07', '08:00', '17:00')];
    const adv = [
      { tipo: 'ANTICIPO' as const, monto: 15 },
      { tipo: 'ANTICIPO' as const, monto: 10 },
    ];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-06', '2026-07-07', adv);
    expect(r.sueldoBase).toBe(40); // 20 + 20
    expect(r.anticipos).toBe(25); // 15 + 10
    expect(r.multaManual).toBe(0);
    expect(r.totalARecibir).toBe(15); // 40 - 25
  });

  it('separa anticipos de multas manuales y ambos restan del total', () => {
    const att = [attDia('2026-07-06', '08:00', '17:00'), attDia('2026-07-07', '08:00', '17:00')];
    const adv = [
      { tipo: 'ANTICIPO' as const, monto: 10 },
      { tipo: 'MULTA' as const, monto: 5 },
    ];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-06', '2026-07-07', adv);
    expect(r.sueldoBase).toBe(40);
    expect(r.anticipos).toBe(10);
    expect(r.multaManual).toBe(5);
    expect(r.totalARecibir).toBe(25); // 40 - 10 - 5
  });

  it('sin descuentos, anticipos y multaManual son 0 y el total no cambia', () => {
    const att = [attDia('2026-07-06', '08:00', '17:00')];
    const r = calcularNominaEmpleado(emp(), BIZ, att, [], '2026-07-06', '2026-07-06');
    expect(r.anticipos).toBe(0);
    expect(r.multaManual).toBe(0);
    expect(r.totalARecibir).toBe(20);
  });
});
