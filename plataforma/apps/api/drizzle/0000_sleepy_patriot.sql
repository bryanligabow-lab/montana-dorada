CREATE TABLE IF NOT EXISTS "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"hora_entrada" text,
	"hora_salida" text,
	"entrada_at" timestamp with time zone,
	"salida_at" timestamp with time zone,
	"estado" text,
	"min_tarde" integer DEFAULT 0 NOT NULL,
	"motivo_tarde" text,
	"horas_trabajadas" text,
	"gps_lat" double precision,
	"gps_lng" double precision,
	"gps_dist" double precision,
	"gps_valido" boolean,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "uq_att_dia" UNIQUE("employee_id","fecha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"user_id" uuid,
	"actor_nombre" text NOT NULL,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"timezone" text DEFAULT 'America/Guayaquil' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"radio_metros" integer DEFAULT 80 NOT NULL,
	"hora_entrada_lv" text DEFAULT '08:00:00' NOT NULL,
	"hora_entrada_fds" text DEFAULT '08:00:00' NOT NULL,
	"multa_por_min" double precision DEFAULT 0.1 NOT NULL,
	"day_cutoff_hour" integer DEFAULT 2 NOT NULL,
	"gps_requerido" boolean DEFAULT true NOT NULL,
	"branding" jsonb DEFAULT '{"primary":"#43A047","accent":"#E53935","bg":"#0A1A0F","card":"#0F2417"}'::jsonb NOT NULL,
	"report_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"qr_token" text NOT NULL,
	"nombre" text NOT NULL,
	"sueldo" double precision DEFAULT 0 NOT NULL,
	"sueldo_fds" double precision DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'ACTIVO' NOT NULL,
	"deuda_inicial" double precision DEFAULT 0 NOT NULL,
	"pin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "uq_emp_codigo" UNIQUE("business_id","codigo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "punctuality" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"hora_entrada" text NOT NULL,
	"min_tarde" integer DEFAULT 0 NOT NULL,
	"min_temprano" integer DEFAULT 0 NOT NULL,
	"nivel" text,
	"puntos" integer DEFAULT 0 NOT NULL,
	"multa_pagada" double precision DEFAULT 0 NOT NULL,
	"multa_ganada" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_punt_dia" UNIQUE("employee_id","fecha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" text DEFAULT 'ADMIN' NOT NULL,
	"business_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "punctuality" ADD CONSTRAINT "punctuality_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "punctuality" ADD CONSTRAINT "punctuality_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
