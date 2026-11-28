-- Items now come from the editor's own vocabulary sheet (ADR 0011). Earlier items (explained by the local AI) keep
-- their words: the English meaning becomes the definition, the example and synonyms move to the new shapes; items
-- the AI never explained wait for the editor as drafts. Published rows are frozen, so the guard is paused here.
ALTER TABLE "lexical_items" DISABLE TRIGGER "lexical_items_frozen";--> statement-breakpoint
UPDATE "lexical_items" SET
  "definition" = "meaning",
  "examples" = CASE WHEN "example" IS NULL THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object('text', "example", 'translations', '{}'::jsonb)) END,
  "synonyms" = COALESCE((SELECT jsonb_agg(jsonb_build_object('text', s, 'note', NULL, 'translations', '{}'::jsonb))
    FROM jsonb_array_elements_text("synonyms") AS s), '[]'::jsonb),
  "kind" = COALESCE("kind", 'KEYWORD'),
  "status" = CASE WHEN "status" = 'PENDING' THEN 'DRAFT' ELSE "status" END;--> statement-breakpoint
ALTER TABLE "lexical_items" ENABLE TRIGGER "lexical_items_frozen";
