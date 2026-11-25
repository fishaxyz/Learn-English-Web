import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, questionType } from "./common";
import { resourceRevisions } from "./content";
import { sites, users } from "./identity";

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

/**
 * Questions drafted by the local language model for a draft's script (the worker's questions.suggest job). An
 * editor approves each one, which adds it to the draft's exercises (where it can still be edited), or removes it.
 * Editorial only: never learner-facing. `questionJson` is a full question as editors write it (validated by the
 * API, answer key included); `textHash` says which script it was drafted from.
 */
export const questionSuggestions = pgTable(
  "question_suggestions",
  {
    id: id(),
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    /** PENDING, APPROVED or REJECTED. */
    status: text().notNull().default("PENDING"),
    type: questionType().notNull(),
    questionJson: jsonb().notNull(),
    textHash: text().notNull(),
    position: integer().notNull().default(0),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "question_suggestions_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    index("question_suggestions_revision").on(t.revisionId, t.status),
    check("question_suggestions_status", sql`${t.status} in ('PENDING', 'APPROVED', 'REJECTED')`),
  ]
);
