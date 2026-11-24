ALTER TYPE "public"."lexical_entry_kind" ADD VALUE 'SENTENCE_PATTERN';--> statement-breakpoint
ALTER TABLE "lexical_annotations" ADD COLUMN "is_key" boolean DEFAULT false NOT NULL;