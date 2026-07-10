import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import type { AttendanceState, BusinessBranding, EmployeeStatus, Role } from '@asis/shared';

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  timezone: text('timezone').notNull().default('America/Guayaquil'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  radioMetros: integer('radio_metros').notNull().default(80),
  horaEntradaLv: text('hora_entrada_lv').notNull().default('08:00:00'),
  horaEntradaFds: text('hora_entrada_fds').notNull().default('08:00:00'),
  multaPorMin: doublePrecision('multa_por_min').notNull().default(0.1),
  dayCutoffHour: integer('day_cutoff_hour').notNull().default(2),
  gpsRequerido: boolean('gps_requerido').notNull().default(true),
  branding: jsonb('branding')
    .$type<BusinessBranding>()
    .notNull()
    .default({ primary: '#43A047', accent: '#E53935', bg: '#0A1A0F', card: '#0F2417' }),
  reportEmails: jsonb('report_emails').$type<string[]>().notNull().default([]),
  /** Suscripción activa. Si es false, el negocio queda suspendido (nadie marca ni entra). */
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    qrToken: text('qr_token').notNull().unique(),
    nombre: text('nombre').notNull(),
    sueldo: doublePrecision('sueldo').notNull().default(0),
    sueldoFds: doublePrecision('sueldo_fds').notNull().default(0),
    estado: text('estado').$type<EmployeeStatus>().notNull().default('ACTIVO'),
    deudaInicial: doublePrecision('deuda_inicial').notNull().default(0),
    pin: text('pin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uqCodigo: unique('uq_emp_codigo').on(t.businessId, t.codigo) }),
);

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    fecha: text('fecha').notNull(),
    horaEntrada: text('hora_entrada'),
    horaSalida: text('hora_salida'),
    entradaAt: timestamp('entrada_at', { withTimezone: true }),
    salidaAt: timestamp('salida_at', { withTimezone: true }),
    horaAlmuerzoSalida: text('hora_almuerzo_salida'),
    horaAlmuerzoRegreso: text('hora_almuerzo_regreso'),
    almuerzoSalidaAt: timestamp('almuerzo_salida_at', { withTimezone: true }),
    almuerzoRegresoAt: timestamp('almuerzo_regreso_at', { withTimezone: true }),
    estado: text('estado').$type<AttendanceState>(),
    minTarde: integer('min_tarde').notNull().default(0),
    motivoTarde: text('motivo_tarde'),
    horasTrabajadas: text('horas_trabajadas'),
    gpsLat: doublePrecision('gps_lat'),
    gpsLng: doublePrecision('gps_lng'),
    gpsDist: doublePrecision('gps_dist'),
    gpsValido: boolean('gps_valido'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => ({ uqDia: unique('uq_att_dia').on(t.employeeId, t.fecha) }),
);

export const punctuality = pgTable(
  'punctuality',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    fecha: text('fecha').notNull(),
    horaEntrada: text('hora_entrada').notNull(),
    minTarde: integer('min_tarde').notNull().default(0),
    minTemprano: integer('min_temprano').notNull().default(0),
    nivel: text('nivel'),
    puntos: integer('puntos').notNull().default(0),
    multaPagada: doublePrecision('multa_pagada').notNull().default(0),
    multaGanada: doublePrecision('multa_ganada').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uqDia: unique('uq_punt_dia').on(t.employeeId, t.fecha) }),
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  passwordHash: text('password_hash').notNull(),
  rol: text('rol').$type<Role>().notNull().default('ADMIN'),
  businessIds: jsonb('business_ids').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id'),
  userId: uuid('user_id'),
  actorNombre: text('actor_nombre').notNull(),
  accion: text('accion').notNull(),
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id'),
  detalle: jsonb('detalle').$type<unknown>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
