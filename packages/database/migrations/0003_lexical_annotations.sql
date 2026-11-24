CREATE TABLE "lexical_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"block_id" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"surface_text" text NOT NULL,
	"sense_revision_id" uuid NOT NULL,
	CONSTRAINT "lexical_annotations_range" CHECK ("lexical_annotations"."start" >= 0 and "lexical_annotations"."end" > "lexical_annotations"."start")
);
--> statement-breakpoint
ALTER TABLE "lexical_annotations" ADD CONSTRAINT "lexical_annotations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_annotations" ADD CONSTRAINT "lexical_annotations_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_annotations" ADD CONSTRAINT "lexical_annotations_sense_fk" FOREIGN KEY ("sense_revision_id","site_id") REFERENCES "public"."lexical_sense_revisions"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lexical_annotations_revision" ON "lexical_annotations" USING btree ("revision_id");