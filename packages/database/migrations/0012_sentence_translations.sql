CREATE TABLE "sentence_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"block_id" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"source_text" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_translations_sentence" UNIQUE("revision_id","locale","block_id","start"),
	CONSTRAINT "sentence_translations_status" CHECK ("sentence_translations"."status" in ('DRAFT', 'APPROVED')),
	CONSTRAINT "sentence_translations_locale" CHECK ("sentence_translations"."locale" in ('vi', 'fr', 'de')),
	CONSTRAINT "sentence_translations_span" CHECK ("sentence_translations"."start" >= 0 and "sentence_translations"."end" > "sentence_translations"."start"),
	CONSTRAINT "sentence_translations_text" CHECK (length("sentence_translations"."text") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "sentence_translations" ADD CONSTRAINT "sentence_translations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_translations" ADD CONSTRAINT "sentence_translations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_translations" ADD CONSTRAINT "sentence_translations_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_translations_revision" ON "sentence_translations" USING btree ("revision_id","locale","status");