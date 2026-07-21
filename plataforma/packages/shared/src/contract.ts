import { z } from 'zod';
import type { AttendanceState, Business, BusinessBranding, ClockAction, MedalLevel, User, WeekSchedule } from './types';

// ─── Marcación (PWA) ─────────────────────────────────────────────────────────

/** Contexto que la PWA pide al abrir el QR, para pintarse y mostrar al empleado. */
export interface ClockContext {
  business: {
    nombre: string;
    branding: BusinessBranding;
    gpsRequerido: boolean;
    radioMetros: number;
    lat: number | null;
    lng: number | null;
    horaLimiteHoy: string;
  };
  employee: { nombre: string; codigo: string };
  /** Marcaciones que el empleado puede hacer ahora (según lo que ya marcó hoy). */
  acciones: ClockAction[];
  /** Si el negocio está suspendido (falta de pago), no se puede marcar. */
  suspendido: boolean;
}

export const clockRequestSchema = z.object({
  token: z.string().min(8),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().optional(),
  /** Marcación a registrar. Si se omite, el servidor elige la siguiente natural. */
  action: z.enum(['entrada', 'almuerzo_salida', 'almuerzo_regreso', 'salida']).optional(),
});
export type ClockRequestInput = z.infer<typeof clockRequestSchema>;

export const clockMotivoSchema = z.object({
  token: z.string().min(8),
  motivo: z.string().min(1).max(80),
});
export type ClockMotivoInput = z.infer<typeof clockMotivoSchema>;

/** Resultado de una marcación. La PWA hace switch sobre `kind`. */
export type ClockResult =
  | { kind: 'entrada'; nombre: string; fecha: string; horaEntrada: string; estado: AttendanceState; minTemprano: number; minTarde: number; medal: MedalLevel | null }
  | { kind: 'tardanza_motivo'; nombre: string; fecha: string; horaEntrada: string; minTarde: number; multa: number; motivos: string[] }
  | { kind: 'salida'; nombre: string; fecha: string; horaEntrada: string; horaSalida: string; horasTrabajadas: string; estado: AttendanceState | null; minTarde: number }
  | { kind: 'almuerzo_salida'; nombre: string; fecha: string; hora: string }
  | { kind: 'almuerzo_regreso'; nombre: string; fecha: string; hora: string }
  | { kind: 'espera'; nombre: string; minutosRestantes: number }
  | { kind: 'completo'; nombre: string; fecha: string }
  | { kind: 'duplicado'; nombre: string }
  | { kind: 'suspendido'; nombre: string }
  | { kind: 'fuera_de_rango'; nombre: string; distM: number; radioM: number };

// ─── Auth (panel) ────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  // Acepta correo o usuario simple (p. ej. "Admin"); se compara en minúsculas contra users.email.
  email: z.string().min(1).max(120),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginResult {
  token: string;
  user: User;
  businesses: Business[];
}

// ─── Empleados (CRUD) ────────────────────────────────────────────────────────

export const employeeCreateSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(80),
  sueldo: z.number().nonnegative().default(0),
  sueldoFds: z.number().nonnegative().default(0),
  tipoSueldo: z.enum(['DIARIO', 'FIJO']).default('DIARIO'),
  sueldoFijo: z.number().nonnegative().default(0),
  frecuenciaSueldo: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']).default('MENSUAL'),
  horaExtraTipo: z.enum(['PORCENTAJE', 'FIJO']).default('PORCENTAJE'),
  /** Fracción (0.5 = 50%) si horaExtraTipo='PORCENTAJE', o $/hora si horaExtraTipo='FIJO'. */
  horaExtraValor: z.number().nonnegative().default(0.5),
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
  deudaInicial: z.number().default(0),
  pin: z.string().max(8).optional(),
  /** WhatsApp del empleado (formato libre), para enviarle su recibo de nómina. */
  telefono: z.string().max(30).optional(),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeCreateSchema.partial();
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

// ─── Configuración del negocio ───────────────────────────────────────────────

const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
const todosLosDias = (hora: string): WeekSchedule => ({
  lunes: hora,
  martes: hora,
  miercoles: hora,
  jueves: hora,
  viernes: hora,
  sabado: hora,
  domingo: hora,
});
const DEFAULT_HORARIOS: WeekSchedule = todosLosDias('08:00:00');
const DEFAULT_HORARIOS_SALIDA: WeekSchedule = todosLosDias('17:00:00');

const weekScheduleSchema = z.object({
  lunes: z.string().regex(timeRegex),
  martes: z.string().regex(timeRegex),
  miercoles: z.string().regex(timeRegex),
  jueves: z.string().regex(timeRegex),
  viernes: z.string().regex(timeRegex),
  sabado: z.string().regex(timeRegex),
  domingo: z.string().regex(timeRegex),
});

export const businessCreateSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'solo minúsculas, números y guiones'),
  nombre: z.string().min(1),
  timezone: z.string().default('America/Guayaquil'),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radioMetros: z.number().positive().default(80),
  horarios: weekScheduleSchema.default(DEFAULT_HORARIOS),
  /** Hora de salida esperada por día (define el largo de la jornada para calcular horas extra). */
  horariosSalida: weekScheduleSchema.default(DEFAULT_HORARIOS_SALIDA),
  /** Monto por cada bloque de `multaIntervaloMin` minutos de retraso (o fracción). */
  multaMonto: z.number().nonnegative().default(0.1),
  /** Tamaño del bloque en minutos. 1 = por minuto exacto (comportamiento clásico). */
  multaIntervaloMin: z.number().int().min(1).max(240).default(1),
  dayCutoffHour: z.number().int().min(0).max(23).default(2),
  gpsRequerido: z.boolean().default(true),
  controlAlmuerzo: z.boolean().default(true),
  controlMultas: z.boolean().default(true),
  controlMedallas: z.boolean().default(true),
  branding: z
    .object({
      primary: z.string(),
      accent: z.string(),
      bg: z.string(),
      card: z.string(),
      logoUrl: z.string().optional(),
    })
    .default({ primary: '#43A047', accent: '#E53935', bg: '#0A1A0F', card: '#0F2417' }),
  reportEmails: z.array(z.string().email()).default([]),
  /** Números de WhatsApp (formato libre) que reciben los informes periódicos. */
  reportWhatsapp: z.array(z.string().min(6)).default([]),
  /** JID o número del grupo de WhatsApp notificado en cada marcación. Vacío = desactivado. */
  whatsappGrupoId: z.string().default(''),
});
export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;

export const businessUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  timezone: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radioMetros: z.number().positive().optional(),
  horarios: weekScheduleSchema.partial().optional(),
  horariosSalida: weekScheduleSchema.partial().optional(),
  multaMonto: z.number().nonnegative().optional(),
  multaIntervaloMin: z.number().int().min(1).max(240).optional(),
  dayCutoffHour: z.number().int().min(0).max(23).optional(),
  gpsRequerido: z.boolean().optional(),
  controlAlmuerzo: z.boolean().optional(),
  controlMultas: z.boolean().optional(),
  controlMedallas: z.boolean().optional(),
  branding: z
    .object({
      primary: z.string(),
      accent: z.string(),
      bg: z.string(),
      card: z.string(),
      logoUrl: z.string().optional(),
    })
    .partial()
    .optional(),
  reportEmails: z.array(z.string().email()).optional(),
  reportWhatsapp: z.array(z.string().min(6)).optional(),
  whatsappGrupoId: z.string().optional(),
});
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

// ─── Asistencia (corregir/eliminar un registro desde el panel) ───────────────

export const attendanceUpdateSchema = z.object({
  horaEntrada: z.string().regex(timeRegex).optional(),
  horaSalida: z.string().regex(timeRegex).nullable().optional(),
  horaAlmuerzoSalida: z.string().regex(timeRegex).nullable().optional(),
  horaAlmuerzoRegreso: z.string().regex(timeRegex).nullable().optional(),
});
export type AttendanceUpdateInput = z.infer<typeof attendanceUpdateSchema>;

// ─── Nómina ──────────────────────────────────────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
export const nominaQuerySchema = z.object({
  from: z.string().regex(dateRegex),
  to: z.string().regex(dateRegex),
});
export type NominaQuery = z.infer<typeof nominaQuerySchema>;

// ─── Anticipos ───────────────────────────────────────────────────────────────

export const advanceCreateSchema = z.object({
  employeeId: z.string().uuid(),
  tipo: z.enum(['ANTICIPO', 'MULTA']).default('ANTICIPO'),
  fecha: z.string().regex(dateRegex),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  nota: z.string().max(200).optional(),
});
export type AdvanceCreateInput = z.infer<typeof advanceCreateSchema>;

// ─── Portal del empleado (solo lectura, entra con código + PIN) ───────────────

export const portalLoginSchema = z.object({
  codigo: z.string().min(1).max(20),
  pin: z.string().regex(/^\d{4}$/, 'El PIN son 4 dígitos'),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

/** Datos del empleado y su negocio que el portal usa para pintarse tras el login. */
export interface PortalSession {
  token: string;
  employee: { id: string; codigo: string; nombre: string };
  business: { nombre: string; branding: BusinessBranding };
}

// ─── Usuarios / accesos (solo OWNER) ─────────────────────────────────────────

export const userCreateSchema = z.object({
  // Usuario de acceso: correo o nombre simple (p. ej. "restfull"). Se guarda en minúsculas.
  email: z.string().min(1).max(120),
  nombre: z.string().min(1).max(80),
  password: z.string().min(6).max(72),
  businessIds: z.array(z.string().uuid()).min(1, 'Elige al menos un negocio'),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  /** Usuario/correo de acceso. Se guarda en minúsculas. */
  email: z.string().min(1).max(120).optional(),
  businessIds: z.array(z.string().uuid()).min(1).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userResetPasswordSchema = z.object({
  password: z.string().min(6).max(72),
});
export type UserResetPasswordInput = z.infer<typeof userResetPasswordSchema>;
