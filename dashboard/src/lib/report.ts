import { format, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Asistencia,
  Descanso,
  DescansoTipo,
  Empleado,
  Extra,
  Falta,
  Pago,
  Puntualidad,
} from './types';
import {
  computeNominaMes,
  computeRestDaysForWeek,
  weekRange,
} from './analytics';

export interface InformePayload {
  period: string;
  summary: string;
  detail: {
    generadoEn: string;
    empleados: Array<{
      id: string;
      nombre: string;
      baseMensual: number;
      extras: number;
      faltas: number;
      descuentoFaltas: number;
      descansos: number;
      descansosPorTipo: Record<DescansoTipo, number>;
      anticipos: number;
      totalPagado: number;
      netoMes: number;
    }>;
    totales: {
      baseMes: number;
      extrasMes: number;
      faltasMes: number;
      descuentoFaltasMes: number;
      anticiposMes: number;
      pagadoMes: number;
      netoMes: number;
    };
    descansosSemana: Array<{
      id: string;
      nombre: string;
      fechas: string[];
    }>;
    descansosPorTipoMes: Record<DescansoTipo, number>;
  };
}

export function buildInforme(
  refDate: Date,
  empleados: Empleado[],
  pagos: Pago[],
  descansos: Descanso[],
  faltas: Falta[],
  extras: Extra[],
  puntualidad: Puntualidad[] = [],
  asistencia: Asistencia[] = [],
): InformePayload {
  const periodo = format(refDate, 'MMMM yyyy', { locale: es });
  const nomina = computeNominaMes(refDate, empleados, pagos, descansos, faltas, extras, puntualidad, asistencia);

  const totales = nomina.reduce(
    (acc, r) => ({
      baseMes: acc.baseMes + r.baseMensual,
      extrasMes: acc.extrasMes + r.extras,
      faltasMes: acc.faltasMes + r.faltas,
      descuentoFaltasMes: acc.descuentoFaltasMes + r.descuentoFaltas,
      anticiposMes: acc.anticiposMes + r.anticipos,
      pagadoMes: acc.pagadoMes + r.totalPagado,
      netoMes: acc.netoMes + r.netoMes,
    }),
    {
      baseMes: 0,
      extrasMes: 0,
      faltasMes: 0,
      descuentoFaltasMes: 0,
      anticiposMes: 0,
      pagadoMes: 0,
      netoMes: 0,
    },
  );

  const descansosPorTipoMes: Record<DescansoTipo, number> = {
    PLANIFICADO: 0,
    VACACIONES: 0,
    PERMISO: 0,
    ENFERMEDAD: 0,
  };
  for (const d of descansos) {
    if (!isSameMonth(d.fecha, refDate)) continue;
    descansosPorTipoMes[d.tipo]++;
  }

  const { start: wStart, end: wEnd } = weekRange(refDate);
  void wStart;
  void wEnd;
  const descansosSemana = computeRestDaysForWeek(descansos, empleados, refDate).map((r) => ({
    id: r.empleadoId,
    nombre: r.empleadoNombre,
    fechas: r.restDates.map((f) => format(f, 'yyyy-MM-dd')),
  }));

  const empleadosDetail = nomina.map((r) => ({
    id: r.empleadoId,
    nombre: r.nombre,
    baseMensual: r.baseMensual,
    extras: r.extras,
    faltas: r.faltas,
    descuentoFaltas: r.descuentoFaltas,
    descansos: r.descansos,
    descansosPorTipo: r.descansosPorTipo,
    anticipos: r.anticipos,
    totalPagado: r.totalPagado,
    netoMes: r.netoMes,
  }));

  // Resumen textual para la AI en n8n
  const lines: string[] = [];
  lines.push(`📊 *Informe Montaña Dorada — ${periodo}*`);
  lines.push('');
  lines.push('*Totales del mes:*');
  lines.push(`• Base: $${totales.baseMes.toFixed(2)}`);
  lines.push(`• Extras: +$${totales.extrasMes.toFixed(2)}`);
  lines.push(
    `• Faltas: ${totales.faltasMes}  (−$${totales.descuentoFaltasMes.toFixed(2)})`,
  );
  lines.push(`• Anticipos: −$${totales.anticiposMes.toFixed(2)}`);
  lines.push(`• Pagado total: −$${totales.pagadoMes.toFixed(2)}`);
  lines.push(`• *Neto a pagar: $${totales.netoMes.toFixed(2)}*`);
  lines.push('');
  lines.push('*Por empleado:*');
  for (const e of empleadosDetail) {
    lines.push(
      `• ${e.nombre} — base $${e.baseMensual.toFixed(2)} · extras +$${e.extras.toFixed(2)} · faltas ${e.faltas}(−$${e.descuentoFaltas.toFixed(2)}) · pagado −$${e.totalPagado.toFixed(2)} · neto $${e.netoMes.toFixed(2)}`,
    );
  }
  lines.push('');
  lines.push('*Descansos esta semana:*');
  for (const r of descansosSemana) {
    if (r.fechas.length === 0) continue;
    lines.push(`• ${r.nombre}: ${r.fechas.join(', ')}`);
  }
  lines.push('');
  lines.push('*Descansos por tipo (mes):*');
  for (const tipo of Object.keys(descansosPorTipoMes) as DescansoTipo[]) {
    lines.push(`• ${tipo}: ${descansosPorTipoMes[tipo]}`);
  }

  return {
    period: periodo,
    summary: lines.join('\n'),
    detail: {
      generadoEn: new Date().toISOString(),
      empleados: empleadosDetail,
      totales,
      descansosSemana,
      descansosPorTipoMes,
    },
  };
}
