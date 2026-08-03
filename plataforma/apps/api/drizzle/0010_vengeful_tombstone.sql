CREATE TABLE IF NOT EXISTS "bot_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_bot_num" UNIQUE("business_id","numero")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_sessions" (
	"numero" text PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"historial" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bot_numbers" ADD CONSTRAINT "bot_numbers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
