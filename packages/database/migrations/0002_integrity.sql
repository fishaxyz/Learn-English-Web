-- Integrity rules the database enforces itself, whatever the application does (AGENTS.md §5.1, §5.6).

-- 1. Draft and published pointers may only reference the owner's own revisions.
--    (Kept here because Drizzle can't type two tables that reference each other.)
ALTER TABLE "resource_localizations"
  ADD CONSTRAINT "localizations_draft_fk" FOREIGN KEY ("draft_revision_id", "id")
  REFERENCES "resource_revisions" ("id", "localization_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "resource_localizations"
  ADD CONSTRAINT "localizations_published_fk" FOREIGN KEY ("published_revision_id", "id")
  REFERENCES "resource_revisions" ("id", "localization_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "lexical_senses"
  ADD CONSTRAINT "lexical_senses_draft_fk" FOREIGN KEY ("draft_revision_id", "id")
  REFERENCES "lexical_sense_revisions" ("id", "sense_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "lexical_senses"
  ADD CONSTRAINT "lexical_senses_published_fk" FOREIGN KEY ("published_revision_id", "id")
  REFERENCES "lexical_sense_revisions" ("id", "sense_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- 2. Published revisions are immutable. The only change allowed is PUBLISHED -> SUPERSEDED, when a newer
--    revision is published; nothing else about the row may change, and it can't be deleted.
CREATE FUNCTION guard_frozen_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'published revision % is immutable', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    IF NOT (
      OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED'
      -- "search" is a generated column: not yet computed in a BEFORE trigger, so it's left out.
      AND (to_jsonb(NEW) - 'status' - 'updated_at' - 'search') = (to_jsonb(OLD) - 'status' - 'updated_at' - 'search')
    ) THEN
      RAISE EXCEPTION 'published revision % is immutable', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resource_revisions_frozen BEFORE UPDATE OR DELETE ON "resource_revisions"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_revision();
--> statement-breakpoint
CREATE TRIGGER lexical_sense_revisions_frozen BEFORE UPDATE OR DELETE ON "lexical_sense_revisions"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_revision();
--> statement-breakpoint

-- 3. Nothing attached to a frozen revision may be added, changed or removed either: exercises, answer keys,
--    topics, labels, media, collection items, and a sense's examples, pronunciations and glosses.
CREATE FUNCTION is_frozen_resource_revision(rev uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM resource_revisions WHERE id = rev AND status IN ('PUBLISHED', 'SUPERSEDED'))
$$;
--> statement-breakpoint
CREATE FUNCTION is_frozen_sense_revision(rev uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM lexical_sense_revisions WHERE id = rev AND status IN ('PUBLISHED', 'SUPERSEDED'))
$$;
--> statement-breakpoint
CREATE FUNCTION row_is_frozen(tbl text, r jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF tbl IN ('exercise_sets', 'revision_topics', 'revision_exam_labels', 'revision_media', 'collection_items') THEN
    RETURN is_frozen_resource_revision((r->>'revision_id')::uuid);
  ELSIF tbl = 'questions' THEN
    RETURN is_frozen_resource_revision(
      (SELECT revision_id FROM exercise_sets WHERE id = (r->>'exercise_set_id')::uuid));
  ELSIF tbl IN ('question_options', 'answer_keys') THEN
    RETURN is_frozen_resource_revision((
      SELECT s.revision_id FROM questions q JOIN exercise_sets s ON s.id = q.exercise_set_id
      WHERE q.id = (r->>'question_id')::uuid));
  ELSIF tbl IN ('lexical_examples', 'lexical_pronunciations', 'lexical_glosses') THEN
    RETURN is_frozen_sense_revision((r->>'sense_revision_id')::uuid);
  END IF;
  RETURN false;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_frozen_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND row_is_frozen(TG_TABLE_NAME, to_jsonb(OLD)))
     OR (TG_OP <> 'DELETE' AND row_is_frozen(TG_TABLE_NAME, to_jsonb(NEW))) THEN
    RAISE EXCEPTION '% belongs to a published revision and is immutable', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exercise_sets_frozen BEFORE INSERT OR UPDATE OR DELETE ON "exercise_sets"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER questions_frozen BEFORE INSERT OR UPDATE OR DELETE ON "questions"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER question_options_frozen BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER answer_keys_frozen BEFORE INSERT OR UPDATE OR DELETE ON "answer_keys"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER revision_topics_frozen BEFORE INSERT OR UPDATE OR DELETE ON "revision_topics"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER revision_exam_labels_frozen BEFORE INSERT OR UPDATE OR DELETE ON "revision_exam_labels"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER revision_media_frozen BEFORE INSERT OR UPDATE OR DELETE ON "revision_media"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER collection_items_frozen BEFORE INSERT OR UPDATE OR DELETE ON "collection_items"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER lexical_examples_frozen BEFORE INSERT OR UPDATE OR DELETE ON "lexical_examples"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER lexical_pronunciations_frozen BEFORE INSERT OR UPDATE OR DELETE ON "lexical_pronunciations"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint
CREATE TRIGGER lexical_glosses_frozen BEFORE INSERT OR UPDATE OR DELETE ON "lexical_glosses"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
--> statement-breakpoint

-- 4. A collection item must pin a PUBLISHED sense revision once its own revision is published: checked by the
--    publish service in the same transaction (a trigger can't see the publish order reliably).
COMMENT ON TABLE "collection_items" IS 'Pinned to exact lexical sense revisions; validated on publish.';
