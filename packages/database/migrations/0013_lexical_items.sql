CREATE TABLE "lexical_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"key" text NOT NULL,
	"note" text,
	"kind" text,
	"quote" text,
	"meaning" text,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"example" text,
	"ielts_tip" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_items_key" UNIQUE("revision_id","key"),
	CONSTRAINT "lexical_items_status" CHECK ("lexical_items"."status" in ('PENDING', 'DRAFT', 'APPROVED')),
	CONSTRAINT "lexical_items_kind" CHECK ("lexical_items"."kind" is null or "lexical_items"."kind" in ('KEYWORD', 'COLLOCATION', 'IDIOM', 'PHRASAL_VERB', 'STRUCTURE', 'PARAPHRASE')),
	CONSTRAINT "lexical_items_text" CHECK (length("lexical_items"."text") between 1 and 200),
	CONSTRAINT "lexical_items_approved" CHECK ("lexical_items"."status" <> 'APPROVED' or ("lexical_items"."kind" is not null and "lexical_items"."meaning" is not null))
);
--> statement-breakpoint
ALTER TABLE "lexical_items" ADD CONSTRAINT "lexical_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD CONSTRAINT "lexical_items_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD CONSTRAINT "lexical_items_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lexical_items_revision" ON "lexical_items" USING btree ("revision_id","position");