ALTER TABLE "attendance" ADD COLUMN "hora_almuerzo_salida" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "hora_almuerzo_regreso" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "almuerzo_salida_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "almuerzo_regreso_at" timestamp with time zone;