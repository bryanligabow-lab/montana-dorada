ALTER TABLE "attendance" ADD COLUMN "salida_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "salida_aprob" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "recordatorio_salida_activo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "recordatorio_salida_min" integer DEFAULT 30 NOT NULL;