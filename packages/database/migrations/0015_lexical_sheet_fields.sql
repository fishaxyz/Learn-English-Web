ALTER TABLE "lexical_items" ADD COLUMN "part_of_speech" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "pronunciation" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "definition" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "usage" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "examples" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "paired_with" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "question" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "languages" jsonb DEFAULT '{}'::jsonb NOT NULL;