import { schema, type Database } from "@english/database";
import DataLoader from "dataloader";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type {
  ExamLabelModel,
  ExerciseSetModel,
  LexicalEntryModel,
  LexicalSenseModel,
  LocalizationRow,
  QuestionModel,
  QuestionOptionModel,
  RevisionModel,
  SiteModel,
  TopicModel,
} from "../models";

/** One query per kind of child, however many parents a response has (AGENTS.md §6: no N+1). */
function grouped<K extends string, V>(fetch: (keys: readonly K[]) => Promise<V[]>, keyOf: (row: V) => K) {
  return new DataLoader<K, V[]>(async (keys) => {
    const rows = await fetch(keys);
    const groups = new Map<K, V[]>(keys.map((k) => [k, []]));
    for (const row of rows) groups.get(keyOf(row))?.push(row);
    return keys.map((k) => groups.get(k) ?? []);
  });
}

function single<K extends string, V>(fetch: (keys: readonly K[]) => Promise<V[]>, keyOf: (row: V) => K) {
  return new DataLoader<K, V | null>(async (keys) => {
    const rows = await fetch(keys);
    const byKey = new Map(rows.map((r) => [keyOf(r), r]));
    return keys.map((k) => byKey.get(k) ?? null);
  });
}

type SenseRow = { sense: LexicalSenseModel["sense"]; revision: LexicalSenseModel["revision"] };

/**
 * Created per request and never shared, so one user's results can't leak into another's. Loaders read by id;
 * callers only ever pass ids they got from a query that already applied the site and publication rules.
 */
export function createLoaders(db: Database) {
  const s = schema;
  return {
    site: single<string, SiteModel>(
      (ids) =>
        db
          .select()
          .from(s.sites)
          .where(inArray(s.sites.id, [...ids])),
      (r) => r.id
    ),

    revision: single<string, RevisionModel>(
      (ids) =>
        db
          .select()
          .from(s.resourceRevisions)
          .where(inArray(s.resourceRevisions.id, [...ids])),
      (r) => r.id
    ),

    localizationsByResource: grouped<string, LocalizationRow>(
      (ids) =>
        db
          .select()
          .from(s.resourceLocalizations)
          .where(inArray(s.resourceLocalizations.resourceId, [...ids]))
          .orderBy(asc(s.resourceLocalizations.locale)),
      (r) => r.resourceId
    ),

    topicsByRevision: grouped<string, TopicModel & { revisionId: string }>(
      async (ids) =>
        (
          await db
            .select({ topic: s.topics, revisionId: s.revisionTopics.revisionId })
            .from(s.revisionTopics)
            .innerJoin(s.topics, eq(s.topics.id, s.revisionTopics.topicId))
            .where(inArray(s.revisionTopics.revisionId, [...ids]))
            .orderBy(asc(s.topics.name))
        ).map((r) => ({ ...r.topic, revisionId: r.revisionId })),
      (r) => r.revisionId
    ),

    examLabelsByRevision: grouped<string, ExamLabelModel & { revisionId: string }>(
      async (ids) =>
        (
          await db
            .select({ label: s.examLabels, revisionId: s.revisionExamLabels.revisionId })
            .from(s.revisionExamLabels)
            .innerJoin(s.examLabels, eq(s.examLabels.id, s.revisionExamLabels.examLabelId))
            .where(inArray(s.revisionExamLabels.revisionId, [...ids]))
            .orderBy(asc(s.examLabels.code))
        ).map((r) => ({ ...r.label, revisionId: r.revisionId })),
      (r) => r.revisionId
    ),

    exerciseSetsByRevision: grouped<string, ExerciseSetModel>(
      (ids) =>
        db
          .select()
          .from(s.exerciseSets)
          .where(inArray(s.exerciseSets.revisionId, [...ids]))
          .orderBy(asc(s.exerciseSets.position)),
      (r) => r.revisionId
    ),

    questionsBySet: grouped<string, QuestionModel>(
      (ids) =>
        db
          .select()
          .from(s.questions)
          .where(inArray(s.questions.exerciseSetId, [...ids]))
          .orderBy(asc(s.questions.position)),
      (r) => r.exerciseSetId
    ),

    optionsByQuestion: grouped<string, QuestionOptionModel>(
      (ids) =>
        db
          .select()
          .from(s.questionOptions)
          .where(inArray(s.questionOptions.questionId, [...ids]))
          .orderBy(asc(s.questionOptions.position)),
      (r) => r.questionId
    ),

    entry: single<string, LexicalEntryModel>(
      (ids) =>
        db
          .select()
          .from(s.lexicalEntries)
          .where(inArray(s.lexicalEntries.id, [...ids])),
      (r) => r.id
    ),

    /** Each entry's senses, at their current published revision. */
    publishedSensesByEntry: grouped<string, SenseRow>(
      (ids) =>
        db
          .select({ sense: s.lexicalSenses, revision: s.lexicalSenseRevisions })
          .from(s.lexicalSenses)
          .innerJoin(s.lexicalSenseRevisions, eq(s.lexicalSenseRevisions.id, s.lexicalSenses.publishedRevisionId))
          .where(and(inArray(s.lexicalSenses.entryId, [...ids]), isNotNull(s.lexicalSenses.publishedRevisionId)))
          .orderBy(asc(s.lexicalSenses.createdAt)),
      (r) => r.sense.entryId
    ),

    /** A collection's items at the exact sense revisions it pinned (possibly superseded since: that's the point). */
    collectionItemsByRevision: grouped<string, SenseRow & { revisionId: string }>(
      async (ids) =>
        (
          await db
            .select({
              sense: s.lexicalSenses,
              revision: s.lexicalSenseRevisions,
              revisionId: s.collectionItems.revisionId,
            })
            .from(s.collectionItems)
            .innerJoin(s.lexicalSenseRevisions, eq(s.lexicalSenseRevisions.id, s.collectionItems.senseRevisionId))
            .innerJoin(s.lexicalSenses, eq(s.lexicalSenses.id, s.lexicalSenseRevisions.senseId))
            .where(inArray(s.collectionItems.revisionId, [...ids]))
            .orderBy(asc(s.collectionItems.position))
        ).map((r) => r),
      (r) => r.revisionId
    ),

    /** The senses a revision's text links to, at the pinned revisions, in order of first appearance. */
    annotatedSensesByRevision: grouped<string, SenseRow & { revisionId: string }>(
      async (ids) => {
        const rows = await db
          .select({
            sense: s.lexicalSenses,
            revision: s.lexicalSenseRevisions,
            revisionId: s.lexicalAnnotations.revisionId,
            annotationId: s.lexicalAnnotations.id,
          })
          .from(s.lexicalAnnotations)
          .innerJoin(s.lexicalSenseRevisions, eq(s.lexicalSenseRevisions.id, s.lexicalAnnotations.senseRevisionId))
          .innerJoin(s.lexicalSenses, eq(s.lexicalSenses.id, s.lexicalSenseRevisions.senseId))
          .where(inArray(s.lexicalAnnotations.revisionId, [...ids]))
          .orderBy(asc(s.lexicalAnnotations.blockId), asc(s.lexicalAnnotations.start));
        const seen = new Set<string>();
        return rows.filter((r) => {
          const key = `${r.revisionId}|${r.revision.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      },
      (r) => r.revisionId
    ),

    senseRevision: single<string, LexicalSenseModel["revision"]>(
      (ids) =>
        db
          .select()
          .from(s.lexicalSenseRevisions)
          .where(inArray(s.lexicalSenseRevisions.id, [...ids])),
      (r) => r.id
    ),

    examplesBySenseRevision: grouped<string, typeof s.lexicalExamples.$inferSelect>(
      (ids) =>
        db
          .select()
          .from(s.lexicalExamples)
          .where(inArray(s.lexicalExamples.senseRevisionId, [...ids]))
          .orderBy(asc(s.lexicalExamples.position)),
      (r) => r.senseRevisionId
    ),

    pronunciationsBySenseRevision: grouped<string, typeof s.lexicalPronunciations.$inferSelect>(
      (ids) =>
        db
          .select()
          .from(s.lexicalPronunciations)
          .where(inArray(s.lexicalPronunciations.senseRevisionId, [...ids]))
          .orderBy(asc(s.lexicalPronunciations.accent)),
      (r) => r.senseRevisionId
    ),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
