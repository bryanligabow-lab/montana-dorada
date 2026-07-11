ALTER TABLE "businesses" ADD COLUMN "horarios_salida" jsonb DEFAULT '{"lunes":"17:00:00","martes":"17:00:00","miercoles":"17:00:00","jueves":"17:00:00","viernes":"17:00:00","sabado":"17:00:00","domingo":"17:00:00"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "tipo_sueldo" text DEFAULT 'DIARIO' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "sueldo_fijo" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "frecuencia_sueldo" text DEFAULT 'MENSUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "hora_extra_tipo" text DEFAULT 'PORCENTAJE' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "hora_extra_valor" double precision DEFAULT 0.5 NOT NULL;