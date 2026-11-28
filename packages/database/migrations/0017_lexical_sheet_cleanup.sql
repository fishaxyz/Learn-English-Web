ALTER TABLE "lexical_items" DROP CONSTRAINT "lexical_items_approved";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP CONSTRAINT "lexical_items_status";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP CONSTRAINT "lexical_items_kind";--> statement-breakpoint
ALTER TABLE "lexical_items" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lexical_items" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "lexical_items" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP COLUMN "quote";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP COLUMN "meaning";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP COLUMN "example";--> statement-breakpoint
ALTER TABLE "lexical_items" DROP COLUMN "ielts_tip";--> statement-breakpoint
ALTER TABLE "lexical_items" ADD CONSTRAINT "lexical_items_status" CHECK ("lexical_items"."status" in ('DRAFT', 'APPROVED'));--> statement-breakpoint
ALTER TABLE "lexical_items" ADD CONSTRAINT "lexical_items_kind" CHECK ("lexical_items"."kind" in ('KEYWORD', 'COLLOCATION', 'IDIOM', 'PHRASAL_VERB', 'STRUCTURE', 'PARAPHRASE'));