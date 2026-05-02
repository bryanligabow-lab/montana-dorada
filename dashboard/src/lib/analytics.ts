import {
  eachDayOfInterval,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  isWithinInterval,
  startOfISOWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import type {
  Asistencia,
  Descanso,
  DescansoTipo,
  Empleado,
  Extra,
  Falta,
  KpiSummary,
  Pago,
  Puntualidad,
  RestDaysEntry,
} from './types';

export function weekKey(date: Date): string {
  const y = getISOWeekYear(date);
  const w = getISOWeek(date);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function weekRange(date: Date): { start: Date; end: Date; days: Date[] } {
  const start = startOfISOWeek(date);
  const end = endOfISOWeek(date);
  return { start, end, days: eachDayOfInterval({ start, end }) };
}

/** Un día es de descanso si existe fila en DESCANSOS para (empleadoId, fecha). */
export function isRestDay(
  descansos: Descanso[],
  empleadoId: string,
  date: Date,
): Descanso | null {
  return (
    descansos.find((d) => d.id === empleadoId && isSameDay(d.fecha, date)) ?? null
  );
}

/**
 * Para cada empleado activo, lista los descansos registrados en la semana ISO
 * indicada.
 */
export function computeRestDaysForWeek(
  descansos: Descanso[],
  empleados: Empleado[],
  refDate: Date,
): RestDaysEntry[] {
  const { start, end, days } = weekRange(refDate);
  const activos = empleados.filter((e) => e.estado === 'ACTIVO');
  const out: RestDaysEntry[] = [];
  for (const e of activos) {
    const restDates: Date[] = [];
    for (const d of days) {
      if (isRestDay(descansos, e.id, d)) restDates.push(d);
    }
    out.push({
      empleadoId: e.id,
      empleadoNombre: e.nombre,
      weekKey: weekKey(start),
      restDates,
    });
  }
  void end;
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Nómina del mes — todo se registra en la plataforma, nada sale de asistencia.
// ────────────────────────────────────────────────────────────────────────────

export interface NominaResumen {
  empleadoId: string;
  nombre: string;
  sueldoDiario: number;
  sueldoFds: number;
  sueldoMensual: number;
  faltas: number;
  descuentoFaltas: number; // $ total descontado por faltas
  descansos: number;
  descansosPorTipo: Record<DescansoTipo, number>;
  anticipos: number;
  otrosPagos: number;
  totalPagado: number;
  extras: number;
  multasGanadas: number;
  multasPagadas: number;
  minTardeTotal: number;
  minTempranoTotal: number;
  vecesTarde: number;
  faltasManuales: number;
  autoFaltas: number;
  autoFaltasFechas: Date[];
  autoDescansos: number;
  autoDescansosFechas: Date[];
  cuotaDescansosMes: number;
  baseMensual: number;
  netoMes: number; // baseMensual + extras - descuentoFaltas - multasGanadas - totalPagado
  faltasDetalle: Falta[];
  extrasDetalle: Extra[];
  anticiposDetalle: Pago[];
  descansosDetalle: Descanso[];
  puntualidadDetalle: Puntualidad[];
}

function filterMonth<T extends { fecha: Date }>(items: T[], ref: Date): T[] {
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return items.filter((i) => isWithinInterval(i.fecha, { start, end }));
}

export function computeNominaMes(
  refDate: Date,
  empleados: Empleado[],
  pagos: Pago[],
  descansos: Descanso[],
  faltas: Falta[],
  extras: Extra[],
  puntualidad: Puntualidad[] = [],
  asistencia: Asistencia[] = [],
): NominaResumen[] {
  const activos = empleados.filter((e) => e.estado === 'ACTIVO');
  // Solo se descuentan pagos registrados desde la plataforma (con rowId).
  const pagosPlataforma = pagos.filter((p) => !!p.rowId);

  // Días del mes hasta hoy (no contamos futuro como falta auto)
  const today = new Date();
  const mStart = startOfMonth(refDate);
  const mEnd = endOfMonth(refDate);
  const lastDay = today < mEnd ? today : mEnd;
  const allDays = eachDayOfInterval({ start: mStart, end: lastDay });

  return activos.map((e) => {
    const mesFaltas = filterMonth(faltas, refDate).filter((f) => f.id === e.id);
    const mesExtras = filterMonth(extras, refDate).filter((x) => x.id === e.id);
    const mesPagos = filterMonth(pagosPlataforma, refDate).filter((p) => p.id === e.id);
    const mesDesc = filterMonth(descansos, refDate).filter((d) => d.id === e.id);
    const mesPunt = filterMonth(puntualidad, refDate).filter((p) => p.id === e.id);
    const mesAsis = filterMonth(asistencia, refDate).filter(
      (a) => a.id === e.id && !!a.horaEntrada?.trim(),
    );

    // Sets de fechas (yyyy-MM-dd) por categoría
    const descSet = new Set(mesDesc.map((d) => format(d.fecha, 'yyyy-MM-dd')));
    const puntSet = new Set(mesPunt.map((p) => format(p.fecha, 'yyyy-MM-dd')));
    const asisSet = new Set(mesAsis.map((a) => format(a.fecha, 'yyyy-MM-dd')));
    const faltaManualSet = new Set(mesFaltas.map((f) => format(f.fecha, 'yyyy-MM-dd')));

    // Auto-faltas: día pasado, sin descanso, sin asistencia (Hoja 1 NI
    // PUNTUALIDAD), sin falta manual. Solo cuenta si HUBO al menos un
    // registro de asistencia o puntualidad ese día para alguien (evita
    // falsos positivos cuando el bot/sistema no operó).
    const dayHasAnyMarcacion = (d: Date) => {
      const k = format(d, 'yyyy-MM-dd');
      return (
        puntualidad.some((p) => format(p.fecha, 'yyyy-MM-dd') === k) ||
        asistencia.some((a) => !!a.horaEntrada?.trim() && format(a.fecha, 'yyyy-MM-dd') === k)
      );
    };

    // Días "ausentes" candidatos: no trabajó, no tiene descanso planificado,
    // no tiene falta manual, y hubo actividad en el sistema ese día.
    const ausentesFechas: Date[] = [];
    for (const d of allDays) {
      const k = format(d, 'yyyy-MM-dd');
      if (descSet.has(k)) continue;
      if (puntSet.has(k) || asisSet.has(k)) continue;
      if (faltaManualSet.has(k)) continue;
      if (!dayHasAnyMarcacion(d)) continue;
      ausentesFechas.push(d);
    }

    // Cuota: cada empleado tiene 4 días libres al mes. Los descansos
    // planificados ya se cuentan, así que la cuota efectiva restante es
    // 4 - (descansos planificados PLANIFICADO/PERMISO/VACACIONES/ENFERMEDAD).
    // ASISTIO_SIN_REGISTRO NO consume cuota: el empleado vino, solo olvidó
    // marcar — cuenta como día trabajado normal.
    // Hasta llenar la cuota, los días ausentes son "descanso automático"
    // (no descuentan). El resto son auto-faltas que sí descuentan.
    var QUOTA_DESCANSOS_MES = 4;
    var descansosUsados = mesDesc.filter((d) => d.tipo !== 'ASISTIO_SIN_REGISTRO').length;
    var cuotaRestante = Math.max(0, QUOTA_DESCANSOS_MES - descansosUsados);
    var autoDescansosFechas = ausentesFechas.slice(0, cuotaRestante);
    var autoFaltasFechas = ausentesFechas.slice(cuotaRestante);

    const descuentoFaltasManuales = mesFaltas.reduce(
      (acc, f) => acc + (f.descuento > 0 ? f.descuento : e.sueldoDiario),
      0,
    );
    const descuentoAutoFaltas = autoFaltasFechas.length * e.sueldoDiario;
    const descuentoFaltas = descuentoFaltasManuales + descuentoAutoFaltas;

    let anticipos = 0;
    let otrosPagos = 0;
    for (const p of mesPagos) {
      if (/anticipo/i.test(p.tipoPago)) anticipos += p.monto;
      else otrosPagos += p.monto;
    }
    const totalPagado = anticipos + otrosPagos;
    const totalExtras = mesExtras.reduce((a, x) => a + x.monto, 0);

    const descansosPorTipo: Record<DescansoTipo, number> = {
      PLANIFICADO: 0,
      VACACIONES: 0,
      PERMISO: 0,
      ENFERMEDAD: 0,
      ASISTIO_SIN_REGISTRO: 0,
    };
    for (const d of mesDesc) descansosPorTipo[d.tipo]++;

    const multasGanadas = mesPunt.reduce((a, p) => a + p.multaGanada, 0);
    const multasPagadas = mesPunt.reduce((a, p) => a + p.multaPagada, 0);
    const minTardeTotal = mesPunt.reduce((a, p) => a + p.minTarde, 0);
    const minTempranoTotal = mesPunt.reduce((a, p) => a + p.minTemprano, 0);
    const vecesTarde = mesPunt.filter((p) => p.minTarde > 0).length;

    const baseMensual = e.sueldoMensual;
    const netoMes =
      baseMensual + totalExtras - descuentoFaltas - multasGanadas - totalPagado;

    return {
      empleadoId: e.id,
      nombre: e.nombre,
      sueldoDiario: e.sueldoDiario,
      sueldoFds: e.sueldoFds,
      sueldoMensual: e.sueldoMensual,
      faltas: mesFaltas.length + autoFaltasFechas.length,
      faltasManuales: mesFaltas.length,
      autoFaltas: autoFaltasFechas.length,
      autoFaltasFechas,
      autoDescansos: autoDescansosFechas.length,
      autoDescansosFechas,
      cuotaDescansosMes: QUOTA_DESCANSOS_MES,
      descuentoFaltas,
      descansos: mesDesc.length + autoDescansosFechas.length,
      descansosPorTipo,
      anticipos,
      otrosPagos,
      totalPagado,
      extras: totalExtras,
      multasGanadas,
      multasPagadas,
      minTardeTotal,
      minTempranoTotal,
      vecesTarde,
      baseMensual,
      netoMes,
      faltasDetalle: mesFaltas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
      extrasDetalle: mesExtras.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
      anticiposDetalle: mesPagos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
      descansosDetalle: mesDesc.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
      puntualidadDetalle: mesPunt.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    };
  });
}

export function kpiSummary(
  empleados: Empleado[],
  pagos: Pago[],
  descansos: Descanso[],
  faltas: Falta[],
  extras: Extra[],
  puntualidad: Puntualidad[] = [],
  asistencia: Asistencia[] = [],
  now: Date = new Date(),
): KpiSummary & {
  netoMes: number;
  faltasMes: number;
  extrasMes: number;
  multasMes: number;
  minTardeMes: number;
  trabajandoHoy: number;
} {
  const activos = empleados.filter((e) => e.estado === 'ACTIVO');
  const { start: wStart, end: wEnd } = weekRange(now);
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  const descansosSemana = descansos.filter((d) =>
    isWithinInterval(d.fecha, { start: wStart, end: wEnd }),
  ).length;

  // KPIs del Resumen también ignoran filas históricas sin rowId (consistente
  // con la sección Pagos y con Nómina).
  const pagosPlataforma = pagos.filter((p) => !!p.rowId);
  const pagosMes = pagosPlataforma.filter((p) =>
    isWithinInterval(p.fecha, { start: mStart, end: mEnd }),
  );
  const totalPagadoMes = pagosMes.reduce((acc, p) => acc + p.monto, 0);
  const anticiposMes = pagosMes
    .filter((p) => /anticipo/i.test(p.tipoPago))
    .reduce((acc, p) => acc + p.monto, 0);

  const extrasMes = extras
    .filter((x) => isWithinInterval(x.fecha, { start: mStart, end: mEnd }))
    .reduce((a, x) => a + x.monto, 0);

  const puntMes = puntualidad.filter((p) =>
    isWithinInterval(p.fecha, { start: mStart, end: mEnd }),
  );
  const multasMes = puntMes.reduce((a, p) => a + p.multaGanada, 0);
  const minTardeMes = puntMes.reduce((a, p) => a + p.minTarde, 0);

  const nomina = computeNominaMes(
    now,
    empleados,
    pagos,
    descansos,
    faltas,
    extras,
    puntualidad,
    asistencia,
  );
  const netoMes = nomina.reduce((acc, r) => acc + r.netoMes, 0);
  const faltasMes = nomina.reduce((acc, r) => acc + r.faltas, 0);
  const trabajandoHoy = quienTrabajaHoy(asistencia, empleados, now).length;

  return {
    activosCount: activos.length,
    diasTrabajadosSemana: descansosSemana,
    totalPagadoMes,
    anticiposMes,
    saldoAcumuladoTotal: netoMes,
    netoMes,
    faltasMes,
    extrasMes,
    multasMes,
    minTardeMes,
    trabajandoHoy,
  };
}

/**
 * Devuelve quién está trabajando hoy (tiene fila de asistencia con HORA ENTRADA
 * para la fecha actual y aún no marcó salida = en turno; con salida = ya cerró).
 */
export interface QuienTrabajaHoy {
  empleadoId: string;
  nombre: string;
  horaEntrada: string;
  horaSalida?: string;
  enTurno: boolean;
}

export function quienTrabajaHoy(
  asistencia: Asistencia[],
  empleados: Empleado[],
  now: Date = new Date(),
): QuienTrabajaHoy[] {
  const hoyKey = format(now, 'yyyy-MM-dd');
  const empMap = new Map(empleados.map((e) => [e.id, e]));
  return asistencia
    .filter((a) => format(a.fecha, 'yyyy-MM-dd') === hoyKey && !!a.horaEntrada?.trim())
    .map((a) => ({
      empleadoId: a.id,
      nombre: empMap.get(a.id)?.nombre ?? a.nombre,
      horaEntrada: a.horaEntrada!,
      horaSalida: a.horaSalida || undefined,
      enTurno: !a.horaSalida?.trim(),
    }))
    .sort((a, b) => a.horaEntrada.localeCompare(b.horaEntrada));
}

export function pagosByDayLast30(pagos: Pago[], now: Date = new Date()): {
  fecha: string;
  total: number;
}[] {
  const out = new Map<string, number>();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  for (const p of pagos) {
    if (p.fecha < cutoff) continue;
    const key = format(p.fecha, 'yyyy-MM-dd');
    out.set(key, (out.get(key) ?? 0) + p.monto);
  }
  const days = eachDayOfInterval({ start: cutoff, end: now });
  return days.map((d) => {
    const key = format(d, 'yyyy-MM-dd');
    return { fecha: format(d, 'dd MMM'), total: out.get(key) ?? 0 };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Informe semanal al jefe (texto plano para WhatsApp via Evolution API)
// ────────────────────────────────────────────────────────────────────────────

const DOW_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Construye el mensaje de WhatsApp para el jefe con:
 *  - Saludo
 *  - Lista de descansos de la semana en curso (con tipo)
 *  - Para cada día de la semana: quiénes trabajan (= activos sin descanso ese día)
 *  - Faltas/extras útiles del mes en curso
 */
export function buildInformeJefe(
  empleados: Empleado[],
  descansos: Descanso[],
  faltas: Falta[],
  refDate: Date = new Date(),
): string {
  const activos = empleados.filter((e) => e.estado === 'ACTIVO');
  const { start, end, days } = weekRange(refDate);

  const descSemana = descansos
    .filter((d) => isWithinInterval(d.fecha, { start, end }))
    .filter((d) => activos.some((a) => a.id === d.id))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const lines: string[] = [];
  lines.push('👋 Hola jefe, buen día.');
  lines.push('');
  lines.push(
    `📋 *Informe semanal* (${format(start, 'dd/MM')} – ${format(end, 'dd/MM/yyyy')})`,
  );
  lines.push('');

  // Sección 1: Descansos de la semana
  lines.push('🌴 *Descansos esta semana:*');
  if (descSemana.length === 0) {
    lines.push('   _Nadie tiene descanso registrado._');
  } else {
    for (const d of descSemana) {
      const dia = DOW_NAMES[(d.fecha.getDay() + 6) % 7];
      lines.push(
        `   • ${dia} ${format(d.fecha, 'dd/MM')} — ${d.nombre} (${d.tipo})`,
      );
    }
  }
  lines.push('');

  // Sección 2: Quiénes trabajan cada día
  lines.push('👥 *Trabajan cada día:*');
  for (const day of days) {
    const dia = DOW_NAMES[(day.getDay() + 6) % 7];
    const fechaTxt = format(day, 'dd/MM');
    const conDescanso = new Set(
      descSemana.filter((d) => isSameDay(d.fecha, day)).map((d) => d.id),
    );
    const trabajan = activos.filter((e) => !conDescanso.has(e.id));
    if (trabajan.length === 0) {
      lines.push(`   • ${dia} ${fechaTxt}: _nadie trabaja_`);
    } else {
      lines.push(`   • ${dia} ${fechaTxt} (${trabajan.length}):`);
      for (const e of trabajan) lines.push(`       – ${e.nombre}`);
    }
  }
  lines.push('');

  // Sección 3: Info útil del mes
  const mStart = startOfMonth(refDate);
  const mEnd = endOfMonth(refDate);
  const faltasMes = faltas.filter((f) =>
    isWithinInterval(f.fecha, { start: mStart, end: mEnd }),
  );
  if (faltasMes.length > 0) {
    lines.push(`⚠️ *Faltas del mes:* ${faltasMes.length}`);
    const top = faltasMes
      .slice()
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
      .slice(0, 5);
    for (const f of top) {
      lines.push(`   • ${format(f.fecha, 'dd/MM')} — ${f.nombre}`);
    }
    if (faltasMes.length > 5) lines.push(`   … y ${faltasMes.length - 5} más`);
    lines.push('');
  }

  lines.push('— Reporte automático · Plataforma Montaña Dorada');
  return lines.join('\n');
}
