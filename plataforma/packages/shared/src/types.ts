// Tipos de dominio compartidos por API, PWA de marcación y panel admin.

export type Role = 'OWNER' | 'ADMIN';
export type EmployeeStatus = 'ACTIVO' | 'INACTIVO';

/** Estado de la entrada respecto a la hora límite del negocio. */
export type AttendanceState = 'TEMPRANO' | 'A_TIEMPO' | 'TARDE';

export interface MedalLevel {
  key: 'diamante' | 'oro' | 'plata' | 'bronce';
  /** Minutos de adelanto (antes de la hora límite) a partir de los cuales aplica. */
  minDesde: number;
  nombre: string;
  emoji: string;
  puntos: number;
  color: string;
  bg: string;
}

/** Colores de marca por negocio (la PWA y el panel se pintan con esto). */
export interface BusinessBranding {
  primary: string;
  accent: string;
  bg: string;
  card: string;
  logoUrl?: string;
}

export interface Business {
  id: string;
  slug: string;
  nombre: string;
  timezone: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  /** 'HH:mm:ss' — hora límite de entrada de lunes a viernes. */
  horaEntradaLv: string;
  /** 'HH:mm:ss' — hora límite de entrada sábado y domingo. */
  horaEntradaFds: string;
  multaPorMin: number;
  /** Hora (0-23) en que arranca el día operativo. Antes de esto cuenta como el día anterior. */
  dayCutoffHour: number;
  gpsRequerido: boolean;
  branding: BusinessBranding;
  reportEmails: string[];
  createdAt: string;
}

export interface Employee {
  id: string;
  businessId: string;
  /** Identificador corto y legible (lo que hoy es la columna ID). */
  codigo: string;
  /** Token secreto que viaja en el QR; no es el código visible. */
  qrToken: string;
  nombre: string;
  sueldo: number;
  sueldoFds: number;
  estado: EmployeeStatus;
  deudaInicial: number;
  pin: string | null;
  createdAt: string;
}

export interface Attendance {
  id: string;
  businessId: string;
  employeeId: string;
  /** 'yyyy-MM-dd' del día operativo. */
  fecha: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  entradaAt: string | null;
  salidaAt: string | null;
  estado: AttendanceState | null;
  minTarde: number;
  motivoTarde: string | null;
  horasTrabajadas: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  /** Distancia en metros al negocio al momento de marcar. */
  gpsDist: number | null;
  gpsValido: boolean | null;
  ip: string | null;
  userAgent: string | null;
}

export interface Punctuality {
  id: string;
  businessId: string;
  employeeId: string;
  fecha: string;
  horaEntrada: string;
  minTarde: number;
  minTemprano: number;
  nivel: string | null;
  puntos: number;
  multaPagada: number;
  multaGanada: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: Role;
  /** Negocios a los que tiene acceso. OWNER ve todos. */
  businessIds: string[];
}

export interface AuditLog {
  id: string;
  businessId: string | null;
  userId: string | null;
  actorNombre: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: unknown;
  createdAt: string;
}

/** Fila agregada de ranking por empleado. */
export interface PunctualitySummary {
  employeeId: string;
  codigo: string;
  nombre: string;
  dias: number;
  tempranos: number;
  tardanzas: number;
  puntos: number;
  multaPagada: number;
  multaGanada: number;
}
