-- A lesson's lexical items are frozen with its published revision, like everything else attached to it.
CREATE OR REPLACE FUNCTION row_is_frozen(tbl text, r jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF tbl IN ('exercise_sets', 'revision_topics', 'revision_exam_labels', 'revision_media', 'collection_items',
             'lexical_annotations', 'audio_tracks', 'lexical_items') THEN
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
CREATE TRIGGER lexical_items_frozen BEFORE INSERT OR UPDATE OR DELETE ON "lexical_items"
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_children();
