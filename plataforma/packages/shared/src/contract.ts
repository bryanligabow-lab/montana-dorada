import { z } from 'zod';
import type { AttendanceState, Business, BusinessBranding, MedalLevel, User } from './types';

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
}

export const clockRequestSchema = z.object({
  token: z.string().min(8),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().optional(),
});
export type ClockRequestInput = z.infer<typeof clockRequestSchema>;

export const clockMotivoSchema = z.object({
  token: z.string().min(8),
  motivo: z.string().min(1).max(80),
});
export type ClockMotivoInput = z.infer<typeof clockMotivoSchema>;

/** Resultado de una marcación. La PWA hace switch sobre `kind`. */
export type ClockResult =
  | { kind: 'entrada'; nombre: string; fecha: string; horaEntrada: string; estado: AttendanceState; minTemprano: number; medal: MedalLevel | null }
  | { kind: 'tardanza_motivo'; nombre: string; fecha: string; horaEntrada: string; minTarde: number; multa: number; motivos: string[] }
  | { kind: 'salida'; nombre: string; fecha: string; horaEntrada: string; horaSalida: string; horasTrabajadas: string; estado: AttendanceState | null; minTarde: number }
  | { kind: 'espera'; nombre: string; minutosRestantes: number }
  | { kind: 'completo'; nombre: string; fecha: string }
  | { kind: 'duplicado'; nombre: string }
  | { kind: 'fuera_de_rango'; nombre: string; distM: number; radioM: number };

// ─── Auth (panel) ────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
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
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
  deudaInicial: z.number().default(0),
  pin: z.string().max(8).optional(),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeCreateSchema.partial();
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

// ─── Configuración del negocio ───────────────────────────────────────────────

const timeRegex = /^\d{2}:\d{2}:\d{2}$/;

export const businessUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  timezone: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radioMetros: z.number().positive().optional(),
  horaEntradaLv: z.string().regex(timeRegex).optional(),
  horaEntradaFds: z.string().regex(timeRegex).optional(),
  multaPorMin: z.number().nonnegative().optional(),
  dayCutoffHour: z.number().int().min(0).max(23).optional(),
  gpsRequerido: z.boolean().optional(),
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
});
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
