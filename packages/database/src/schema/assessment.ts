import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, questionType } from "./common";
import { resourceRevisions } from "./content";
import { sites } from "./identity";

const siteRef = () =>
  uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" });

/** Exercises belong to one exact revision, so editing a draft never changes a published lesson's questions. */
export const exerciseSets = pgTable(
  "exercise_sets",
  {
    id: id(),
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    title: text().notNull(),
    instructions: text(),
    position: integer().notNull().default(0),
  },
  (t) => [
    foreignKey({
      name: "exercise_sets_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    unique("exercise_sets_id_site").on(t.id, t.siteId),
  ]
);

export const questions = pgTable(
  "questions",
  {
    id: id(),
    siteId: siteRef(),
    exerciseSetId: uuid().notNull(),
    type: questionType().notNull(),
    position: integer().notNull().default(0),
    /** What the learner sees; its shape depends on type and schemaVersion (validated by the API). */
    promptJson: jsonb().notNull(),
    schemaVersion: integer().notNull().default(1),
    points: integer().notNull().default(1),
  },
  (t) => [
    foreignKey({
      name: "questions_set_fk",
      columns: [t.exerciseSetId, t.siteId],
      foreignColumns: [exerciseSets.id, exerciseSets.siteId],
    }).onDelete("cascade"),
    check("questions_points_positive", sql`${t.points} > 0`),
  ]
);

export const questionOptions = pgTable("question_options", {
  id: id(),
  questionId: uuid()
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  content: text().notNull(),
  position: integer().notNull().default(0),
});

/**
 * PRIVATE: how a question is graded. Never part of a public query or a client bundle; it's read only by the
 * grading service, after the learner submits (AGENTS.md §5.4).
 */
export const answerKeys = pgTable("answer_keys", {
  questionId: uuid()
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  gradingJson: jsonb().notNull(),
  explanation: text(),
  gradingVersion: integer().notNull().default(1),
});
