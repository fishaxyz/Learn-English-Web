CREATE TABLE "vocabulary_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"kind" "lexical_entry_kind" NOT NULL,
	"display_form" text NOT NULL,
	"normalized_form" text NOT NULL,
	"part_of_speech" text NOT NULL,
	"block_id" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"surface_text" text NOT NULL,
	"sentence" text NOT NULL,
	"definition" text,
	"cefr_level" "cefr_level",
	"zipf" double precision,
	"source" text NOT NULL,
	"sense_revision_id" uuid,
	"text_hash" text NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_suggestions_span" UNIQUE("revision_id","block_id","start","end"),
	CONSTRAINT "vocabulary_suggestions_status" CHECK ("vocabulary_suggestions"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "vocabulary_suggestions_source" CHECK ("vocabulary_suggestions"."source" in ('nlp', 'ai')),
	CONSTRAINT "vocabulary_suggestions_range" CHECK ("vocabulary_suggestions"."start" >= 0 and "vocabulary_suggestions"."end" > "vocabulary_suggestions"."start")
);
--> statement-breakpoint
ALTER TABLE "vocabulary_suggestions" ADD CONSTRAINT "vocabulary_suggestions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_suggestions" ADD CONSTRAINT "vocabulary_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_suggestions" ADD CONSTRAINT "vocabulary_suggestions_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_suggestions" ADD CONSTRAINT "vocabulary_suggestions_sense_fk" FOREIGN KEY ("sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocabulary_suggestions_revision" ON "vocabulary_suggestions" USING btree ("revision_id","status");