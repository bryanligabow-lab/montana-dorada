ALTER TABLE "businesses" ALTER COLUMN "hora_entrada_lv" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "hora_entrada_lv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "hora_entrada_fds" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "hora_entrada_fds" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "multa_por_min" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "multa_por_min" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "horarios" jsonb DEFAULT '{"lunes":"08:00:00","martes":"08:00:00","miercoles":"08:00:00","jueves":"08:00:00","viernes":"08:00:00","sabado":"08:00:00","domingo":"08:00:00"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "multa_monto" double precision DEFAULT 0.1 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "multa_intervalo_min" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "report_whatsapp" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_grupo_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Traspasa los valores reales de cada negocio (no el default del schema) a las columnas nuevas.
-- multa_intervalo_min se queda en 1 (por minuto exacto): así funcionaba multa_por_min antes.
UPDATE "businesses" SET
  "horarios" = jsonb_build_object(
    'lunes', "hora_entrada_lv", 'martes', "hora_entrada_lv", 'miercoles', "hora_entrada_lv",
    'jueves', "hora_entrada_lv", 'viernes', "hora_entrada_lv",
    'sabado', "hora_entrada_fds", 'domingo', "hora_entrada_fds"
  ),
  "multa_monto" = "multa_por_min"
WHERE "hora_entrada_lv" IS NOT NULL AND "hora_entrada_fds" IS NOT NULL AND "multa_por_min" IS NOT NULL;