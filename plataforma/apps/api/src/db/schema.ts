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
import type {
  AttendanceState,
  BusinessBranding,
  EmployeeStatus,
  FrecuenciaSueldo,
  HoraExtraTipo,
  Role,
  SalidaAprob,
  TipoSueldo,
  WeekSchedule,
} from '@asis/shared';

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

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  timezone: text('timezone').notNull().default('America/Guayaquil'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  radioMetros: integer('radio_metros').notNull().default(80),
  /** Hora límite de entrada por día de la semana. */
  horarios: jsonb('horarios').$type<WeekSchedule>().notNull().default(DEFAULT_HORARIOS),
  /** Hora de salida esperada por día (define el largo de la jornada para calcular horas extra). */
  horariosSalida: jsonb('horarios_salida').$type<WeekSchedule>().notNull().default(DEFAULT_HORARIOS_SALIDA),
  /** Monto por cada bloque de `multaIntervaloMin` minutos de retraso (o fracción). */
  multaMonto: doublePrecision('multa_monto').notNull().default(0.1),
  /** Tamaño del bloque en minutos para el cobro de la multa. 1 = por minuto exacto. */
  multaIntervaloMin: integer('multa_intervalo_min').notNull().default(1),
  dayCutoffHour: integer('day_cutoff_hour').notNull().default(2),
  gpsRequerido: boolean('gps_requerido').notNull().default(true),
  /** Controla salida/regreso de almuerzo. Si es false, solo entrada y salida. */
  controlAlmuerzo: boolean('control_almuerzo').notNull().default(true),
  /** Cobra multa por tardanza (pozo al más temprano). */
  controlMultas: boolean('control_multas').notNull().default(true),
  /** Otorga medallas y puntos por llegar temprano. */
  controlMedallas: boolean('control_medallas').notNull().default(true),
  branding: jsonb('branding')
    .$type<BusinessBranding>()
    .notNull()
    .default({ primary: '#43A047', accent: '#E53935', bg: '#0A1A0F', card: '#0F2417' }),
  reportEmails: jsonb('report_emails').$type<string[]>().notNull().default([]),
  /** Números de WhatsApp que reciben los informes periódicos. */
  reportWhatsapp: jsonb('report_whatsapp').$type<string[]>().notNull().default([]),
  /** JID o número del grupo de WhatsApp notificado en cada marcación. Vacío = desactivado. */
  whatsappGrupoId: text('whatsapp_grupo_id').notNull().default(''),
  /** Enviar recordatorio de salida por WhatsApp a los empleados antes de su hora de salida. */
  recordatorioSalidaActivo: boolean('recordatorio_salida_activo').notNull().default(false),
  /** Minutos antes de la hora de salida esperada en que se envía el recordatorio. */
  recordatorioSalidaMin: integer('recordatorio_salida_min').notNull().default(30),
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
    /** Tarifa por día entre semana (si tipoSueldo='DIARIO'). */
    sueldo: doublePrecision('sueldo').notNull().default(0),
    /** Tarifa por día sábado/domingo (si tipoSueldo='DIARIO'). */
    sueldoFds: doublePrecision('sueldo_fds').notNull().default(0),
    /** 'DIARIO': sueldo/sueldoFds × días trabajados. 'FIJO': sueldoFijo cada frecuenciaSueldo. */
    tipoSueldo: text('tipo_sueldo').$type<TipoSueldo>().notNull().default('DIARIO'),
    /** Monto fijo por período (si tipoSueldo='FIJO'). */
    sueldoFijo: doublePrecision('sueldo_fijo').notNull().default(0),
    frecuenciaSueldo: text('frecuencia_sueldo').$type<FrecuenciaSueldo>().notNull().default('MENSUAL'),
    /** 'PORCENTAJE': horaExtraValor es fracción de recargo sobre su tarifa/hora. 'FIJO': horaExtraValor es $/hora. */
    horaExtraTipo: text('hora_extra_tipo').$type<HoraExtraTipo>().notNull().default('PORCENTAJE'),
    horaExtraValor: doublePrecision('hora_extra_valor').notNull().default(0.5),
    estado: text('estado').$type<EmployeeStatus>().notNull().default('ACTIVO'),
    deudaInicial: doublePrecision('deuda_inicial').notNull().default(0),
    pin: text('pin'),
    /** Número de WhatsApp del empleado (para enviarle su recibo de nómina en PDF). */
    telefono: text('telefono'),
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
    /** La salida la registró el empleado al día siguiente (olvidó marcarla ese día). */
    salidaManual: boolean('salida_manual').notNull().default(false),
    /** Aprobación de la salida manual: 'PENDIENTE'|'APROBADA'|'RECHAZADA'. null = salida normal (en vivo). */
    salidaAprob: text('salida_aprob').$type<SalidaAprob>(),
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

/** Descuentos manuales a un empleado (anticipos de sueldo o multas). Se restan del total de su nómina en el rango. */
export const advances = pgTable('advances', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  /** 'ANTICIPO' (adelanto de sueldo) o 'MULTA' (sanción manual). Ambos restan del total. */
  tipo: text('tipo').$type<'ANTICIPO' | 'MULTA'>().notNull().default('ANTICIPO'),
  /** Día del descuento 'yyyy-MM-dd' (define en qué período de nómina se descuenta). */
  fecha: text('fecha').notNull(),
  monto: doublePrecision('monto').notNull().default(0),
  nota: text('nota'),
  /** Usuario del panel que lo registró. */
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Números de WhatsApp autorizados a usar el chatbot: cada fila enlaza un número (dueño) con un negocio. */
export const botNumbers = pgTable(
  'bot_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    /** Número de WhatsApp (formato libre; se compara por los últimos 9 dígitos). */
    numero: text('numero').notNull(),
    /** Etiqueta para saber de quién es (p. ej. "Fernanda — dueña"). */
    nombre: text('nombre').notNull().default(''),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uqNumero: unique('uq_bot_num').on(t.businessId, t.numero) }),
);

/** Estado de conversación del chatbot por número: negocio activo + historial corto para dar contexto a la IA. */
export const botSessions = pgTable('bot_sessions', {
  /** Número normalizado (últimos 9 dígitos). */
  numero: text('numero').primaryKey(),
  businessId: uuid('business_id'),
  /** Últimos turnos [{role:'user'|'assistant', content:string}] para follow-ups ("y a María también"). */
  historial: jsonb('historial').$type<{ role: 'user' | 'assistant'; content: string }[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
