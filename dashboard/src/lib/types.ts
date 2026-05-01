export type EmpleadoEstado = 'ACTIVO' | 'PASIVO';

export interface Empleado {
  id: string;
  nombre: string;
  sueldoDiario: number;
  estado: EmpleadoEstado;
  sueldoFds: number;
  deudaInicial: number;
  /** Sueldo mensual objetivo (si existe en la hoja). 0 si no está cargado. */
  sueldoMensual: number;
}

export interface Pago {
  id: string;
  nombre: string;
  fecha: Date;
  hora: string;
  tipoPago: string;
  monto: number;
  timestamp?: Date | null;
  /** UUID por fila — si viene vacío es una fila legacy (pre-plataforma). */
  rowId?: string;
}

export type DescansoTipo =
  | 'PLANIFICADO'
  | 'VACACIONES'
  | 'PERMISO'
  | 'ENFERMEDAD'
  /** Asistió pero olvidó registrar entrada/salida. No descuenta y no consume cuota. */
  | 'ASISTIO_SIN_REGISTRO';

export interface Descanso {
  rowId: string;
  id: string;
  nombre: string;
  fecha: Date;
  tipo: DescansoTipo;
  motivo?: string;
  creadoEn?: Date | null;
  actualizadoEn?: Date | null;
}

export interface Falta {
  rowId: string;
  id: string;
  nombre: string;
  fecha: Date;
  motivo?: string;
  /** Descuento aplicado a esta falta (USD). 0 = usa el sueldoDiario del empleado. */
  descuento: number;
  creadoEn?: Date | null;
  actualizadoEn?: Date | null;
}

export interface Extra {
  rowId: string;
  id: string;
  nombre: string;
  fecha: Date;
  concepto: string;
  monto: number;
  creadoEn?: Date | null;
  actualizadoEn?: Date | null;
}

/** Registro de marcación de entrada/salida, leído de Hoja 1 + tabs mensuales. */
export interface Asistencia {
  id: string;
  nombre: string;
  fecha: Date;
  horaEntrada?: string;
  horaSalida?: string;
  estado?: string;
  minTarde?: number;
  motivoTarde?: string;
  horasTrabajadas?: string;
  entradaDatetime?: Date | null;
  salidaDatetime?: Date | null;
}

/** Registro de puntualidad / multas, leído de la tab PUNTUALIDAD. */
export interface Puntualidad {
  id: string;
  nombre: string;
  fecha: Date;
  horaEntrada: string;
  minTarde: number;
  minTemprano: number;
  nivel: string;
  puntos: number;
  multaPagada: number;
  multaGanada: number;
  timestamp?: Date | null;
}

/** Usuario leído desde la tab CONF del Sheet. */
export interface ConfUser {
  key: string;
  rol: string;
  nombre: string;
  numero: string;
  nota: string;
  username: string;
  password: string;
  /** Lista de permisos "recurso.accion" (con soporte "recurso.*" y "*" para admin) */
  permisos: string[];
}

export interface RestDaysEntry {
  empleadoId: string;
  empleadoNombre: string;
  weekKey: string; // ej: "2026-W16"
  restDates: Date[];
}

export interface KpiSummary {
  activosCount: number;
  diasTrabajadosSemana: number;
  totalPagadoMes: number;
  anticiposMes: number;
  saldoAcumuladoTotal: number;
}
