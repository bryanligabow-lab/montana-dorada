import type { FrecuenciaSueldo, HoraExtraTipo, NominaRow, TipoSueldo, WeekSchedule } from '@asis/shared';
import { hhmmssToMs, scheduleKeyForFecha } from './time';

interface Biz {
  horarios: WeekSchedule;
  horariosSalida: WeekSchedule;
  controlAlmuerzo: boolean;
}

interface Emp {
  id: string;
  codigo: string;
  nombre: string;
  sueldo: number;
  sueldoFds: number;
  tipoSueldo: TipoSueldo;
  sueldoFijo: number;
  frecuenciaSueldo: FrecuenciaSueldo;
  horaExtraTipo: HoraExtraTipo;
  horaExtraValor: number;
}

interface AttRow {
  fecha: string;
  entradaAt: Date | null;
  salidaAt: Date | null;
  almuerzoSalidaAt: Date | null;
  almuerzoRegresoAt: Date | null;
}

interface PuntRow {
  multaPagada: number;
  multaGanada: number;
}

interface AdvanceRow {
  monto: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function esFinDeSemana(fecha: string): boolean {
  const key = scheduleKeyForFecha(fecha);
  return key === 'sabado' || key === 'domingo';
}

/** Días reales del mes calendario al que pertenece `fecha` ('yyyy-MM-dd'). */
function diasEnMesDe(fecha: string): number {
  const [y, m] = fecha.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Días que representa un período completo de `frecuencia`, anclado al mes real de `from`.
 * DIARIO y SEMANAL son siempre exactos (1 y 7). QUINCENAL y MENSUAL varían según el mes
 * calendario real (28-31 días) — usar un número fijo (p.ej. 30) infla o reduce el sueldo
 * fijo cada vez que el rango elegido no coincide con esa aproximación.
 */
function divisorFrecuencia(frecuencia: FrecuenciaSueldo, from: string): number {
  if (frecuencia === 'DIARIO') return 1;
  if (frecuencia === 'SEMANAL') return 7;
  const diasMes = diasEnMesDe(from);
  if (frecuencia === 'MENSUAL') return diasMes;
  // QUINCENAL: 1-15 son siempre 15 días; 16-fin son los días que le quedan al mes.
  const diaInicio = Number(from.split('-')[2]);
  return diaInicio <= 15 ? 15 : diasMes - 15;
}

/** Días de calendario entre dos fechas 'yyyy-MM-dd', inclusive. */
export function diasEnRango(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86400000) + 1;
}

/** Minutos realmente trabajados en el día (descuenta el almuerzo si se marcó). */
function minutosTrabajados(a: AttRow): number {
  if (!a.entradaAt || !a.salidaAt) return 0;
  let ms = a.salidaAt.getTime() - a.entradaAt.getTime();
  if (a.almuerzoSalidaAt && a.almuerzoRegresoAt) {
    ms -= a.almuerzoRegresoAt.getTime() - a.almuerzoSalidaAt.getTime();
  }
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** Minutos de jornada esperada (entrada→salida límite del negocio ese día, menos 1h de almuerzo si aplica). */
function minutosJornadaEsperada(biz: Biz, fecha: string): number {
  const key = scheduleKeyForFecha(fecha);
  const entradaMs = hhmmssToMs(biz.horarios[key]) ?? 0;
  const salidaMs = hhmmssToMs(biz.horariosSalida[key]) ?? 0;
  const bruto = Math.max(0, salidaMs - entradaMs);
  const almuerzoMs = biz.controlAlmuerzo ? 60 * 60 * 1000 : 0;
  return Math.max(0, Math.round((bruto - almuerzoMs) / 60000));
}

/**
 * Calcula la nómina de un empleado en un rango de fechas.
 * - tipoSueldo='DIARIO': sueldo/sueldoFds × días trabajados.
 * - tipoSueldo='FIJO': sueldoFijo prorrateado según frecuenciaSueldo vs el largo del rango.
 * - Horas extra: exceso sobre la jornada esperada (horarios→horariosSalida) cada día trabajado.
 * - multaGanada suma, multaPagada resta, anticipos restan.
 */
export function calcularNominaEmpleado(
  emp: Emp,
  biz: Biz,
  attendance: AttRow[],
  punctuality: PuntRow[],
  from: string,
  to: string,
  advances: AdvanceRow[] = [],
): NominaRow {
  let sueldoBase = 0;
  let diasTrabajados = 0;
  let minutosNormalesTotal = 0;
  let minutosExtraTotal = 0;
  let jornadaMinTotal = 0;
  const diasConExtra: { fecha: string; extraMin: number }[] = [];

  for (const a of attendance) {
    if (!a.entradaAt) continue;
    diasTrabajados++;

    const jornadaMin = minutosJornadaEsperada(biz, a.fecha);
    jornadaMinTotal += jornadaMin;

    if (emp.tipoSueldo === 'DIARIO') {
      sueldoBase += esFinDeSemana(a.fecha) ? emp.sueldoFds : emp.sueldo;
    }

    const trabajadoMin = minutosTrabajados(a);
    const extraMin = jornadaMin > 0 ? Math.max(0, trabajadoMin - jornadaMin) : 0;
    minutosExtraTotal += extraMin;
    minutosNormalesTotal += Math.min(trabajadoMin, jornadaMin);
    if (extraMin > 0) diasConExtra.push({ fecha: a.fecha, extraMin });
  }

  if (emp.tipoSueldo === 'FIJO') {
    const dias = diasEnRango(from, to);
    sueldoBase = emp.sueldoFijo * (dias / divisorFrecuencia(emp.frecuenciaSueldo, from));
  }

  // Tarifa/hora promedio para empleados FIJO (usa el sueldo del período contra su jornada esperada).
  const tarifaHoraFijo = jornadaMinTotal > 0 ? sueldoBase / (jornadaMinTotal / 60) : 0;

  let pagoHoraExtra = 0;
  for (const d of diasConExtra) {
    const jornadaMin = minutosJornadaEsperada(biz, d.fecha);
    const tarifaHora =
      emp.tipoSueldo === 'DIARIO'
        ? jornadaMin > 0
          ? (esFinDeSemana(d.fecha) ? emp.sueldoFds : emp.sueldo) / (jornadaMin / 60)
          : 0
        : tarifaHoraFijo;
    const horasExtra = d.extraMin / 60;
    pagoHoraExtra +=
      emp.horaExtraTipo === 'PORCENTAJE'
        ? horasExtra * tarifaHora * (1 + emp.horaExtraValor)
        : horasExtra * emp.horaExtraValor;
  }

  const multaPagada = punctuality.reduce((s, p) => s + p.multaPagada, 0);
  const multaGanada = punctuality.reduce((s, p) => s + p.multaGanada, 0);
  const anticipos = advances.reduce((s, a) => s + a.monto, 0);
  const totalARecibir = sueldoBase + pagoHoraExtra + multaGanada - multaPagada - anticipos;

  return {
    employeeId: emp.id,
    codigo: emp.codigo,
    nombre: emp.nombre,
    tipoSueldo: emp.tipoSueldo,
    diasTrabajados,
    sueldoBase: round2(sueldoBase),
    horasNormales: round2(minutosNormalesTotal / 60),
    horasExtra: round2(minutosExtraTotal / 60),
    pagoHoraExtra: round2(pagoHoraExtra),
    multaPagada: round2(multaPagada),
    multaGanada: round2(multaGanada),
    anticipos: round2(anticipos),
    totalARecibir: round2(totalARecibir),
  };
}
