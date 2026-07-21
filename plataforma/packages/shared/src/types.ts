// Tipos de dominio compartidos por API, PWA de marcación y panel admin.

export type Role = 'OWNER' | 'ADMIN';
export type EmployeeStatus = 'ACTIVO' | 'INACTIVO';

/** ¿El sueldo se paga por cada día trabajado, o es un monto fijo que se repite cada período? */
export type TipoSueldo = 'DIARIO' | 'FIJO';
/** Cada cuánto se repite el sueldo fijo (o cada cuánto se acostumbra pagar). */
export type FrecuenciaSueldo = 'DIARIO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
/** ¿La hora extra se calcula como % de recargo sobre la tarifa del empleado, o es un monto fijo por hora? */
export type HoraExtraTipo = 'PORCENTAJE' | 'FIJO';

/** Estado de la entrada respecto a la hora límite del negocio. */
export type AttendanceState = 'TEMPRANO' | 'A_TIEMPO' | 'TARDE';

/** Las 4 marcaciones posibles en un día. */
export type ClockAction = 'entrada' | 'almuerzo_salida' | 'almuerzo_regreso' | 'salida';

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

/** Hora límite de entrada ('HH:mm:ss') para cada día de la semana. */
export interface WeekSchedule {
  lunes: string;
  martes: string;
  miercoles: string;
  jueves: string;
  viernes: string;
  sabado: string;
  domingo: string;
}

export interface Business {
  id: string;
  slug: string;
  nombre: string;
  timezone: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  /** Hora límite de entrada por día de la semana. */
  horarios: WeekSchedule;
  /** Hora de salida esperada por día de la semana (define el largo de la jornada para calcular horas extra). */
  horariosSalida: WeekSchedule;
  /** Monto que se cobra por cada bloque de `multaIntervaloMin` minutos de retraso (o fracción). */
  multaMonto: number;
  /** Tamaño del bloque en minutos para el cobro de la multa. 1 = por minuto exacto. */
  multaIntervaloMin: number;
  /** Hora (0-23) en que arranca el día operativo. Antes de esto cuenta como el día anterior. */
  dayCutoffHour: number;
  gpsRequerido: boolean;
  /** Controla salida/regreso de almuerzo. */
  controlAlmuerzo: boolean;
  /** Cobra multa por tardanza. */
  controlMultas: boolean;
  /** Otorga medallas y puntos por llegar temprano. */
  controlMedallas: boolean;
  branding: BusinessBranding;
  reportEmails: string[];
  /** Números de WhatsApp que reciben los informes periódicos (diario/semanal/mensual). */
  reportWhatsapp: string[];
  /** JID o número del grupo de WhatsApp que se notifica en cada marcación (entrada/salida/almuerzo). */
  whatsappGrupoId: string;
  /** Suscripción activa. Si es false, el negocio está suspendido. */
  activo: boolean;
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
  /** Tarifa por día entre semana (si tipoSueldo='DIARIO'). */
  sueldo: number;
  /** Tarifa por día sábado/domingo (si tipoSueldo='DIARIO'). */
  sueldoFds: number;
  /** '"DIARIO"': sueldo/sueldoFds se multiplican por días trabajados. '"FIJO"': se paga sueldoFijo cada frecuenciaSueldo. */
  tipoSueldo: TipoSueldo;
  /** Monto fijo por período (si tipoSueldo='FIJO'). */
  sueldoFijo: number;
  /** Cada cuánto se paga (para prorratear sueldoFijo y para saber el ritmo de pago de este empleado). */
  frecuenciaSueldo: FrecuenciaSueldo;
  /** '"PORCENTAJE"': horaExtraValor es una fracción (0.5 = 50% de recargo) sobre su tarifa/hora. '"FIJO"': horaExtraValor es $/hora. */
  horaExtraTipo: HoraExtraTipo;
  horaExtraValor: number;
  estado: EmployeeStatus;
  deudaInicial: number;
  pin: string | null;
  /** WhatsApp del empleado (para enviarle su recibo de nómina). */
  telefono: string | null;
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
  horaAlmuerzoSalida: string | null;
  horaAlmuerzoRegreso: string | null;
  almuerzoSalidaAt: string | null;
  almuerzoRegresoAt: string | null;
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

/** Descuento manual a un empleado (anticipo de sueldo o multa); se resta de su nómina. */
export interface Advance {
  id: string;
  businessId: string;
  employeeId: string;
  tipo: 'ANTICIPO' | 'MULTA';
  fecha: string;
  monto: number;
  nota: string | null;
  createdBy: string | null;
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

/** Fila de la lista de usuarios del panel de dueño (nunca incluye la contraseña). */
export interface PlatformUser {
  id: string;
  email: string;
  nombre: string;
  rol: Role;
  businessIds: string[];
  createdAt: string;
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

/** Fila de nómina de un empleado para un rango de fechas. */
export interface NominaRow {
  employeeId: string;
  codigo: string;
  nombre: string;
  tipoSueldo: TipoSueldo;
  diasTrabajados: number;
  sueldoBase: number;
  horasNormales: number;
  horasExtra: number;
  pagoHoraExtra: number;
  /** Multa automática por tardanza (pozo de puntualidad). */
  multaPagada: number;
  multaGanada: number;
  /** Anticipos entregados en el rango (se restan del total). */
  anticipos: number;
  /** Multas manuales registradas en el rango (se restan del total). */
  multaManual: number;
  /** sueldoBase + pagoHoraExtra + multaGanada - multaPagada - anticipos - multaManual. */
  totalARecibir: number;
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
