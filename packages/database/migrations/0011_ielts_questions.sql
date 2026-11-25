ALTER TYPE "public"."question_type" ADD VALUE 'MULTIPLE_CHOICE';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'YES_NO_NOT_GIVEN';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'MATCHING';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'COMPLETION';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'SHORT_ANSWER';--> statement-breakpoint
CREATE TABLE "question_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"type" "question_type" NOT NULL,
	"question_json" jsonb NOT NULL,
	"text_hash" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_suggestions_status" CHECK ("question_suggestions"."status" in ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "question_suggestions" ADD CONSTRAINT "question_suggestions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_suggestions" ADD CONSTRAINT "question_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_suggestions" ADD CONSTRAINT "question_suggestions_revision_fk" FOREIGN KEY ("revision_id","site_id") REFERENCES "public"."resource_revisions"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_suggestions_revision" ON "question_suggestions" USING btree ("revision_id","status");