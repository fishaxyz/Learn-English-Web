import { schema, type Database } from "@english/database";
import { and, eq } from "drizzle-orm";
import { addExerciseSets } from "../modules/assessment/service";
import { manageLexicalSense, publishLexicalSense } from "../modules/lexicon/service";
import {
  createResource,
  moveDraft,
  publishResource,
  setCollectionItems,
  startDraft,
  updateDraft,
} from "../modules/resources/editorial";
import type { ExerciseSetInput } from "../modules/assessment/schemas";
import type { RichTextDocument } from "../modules/rich-text";
import { one } from "../rows";
import { COLLECTION, EXAM_LABELS, linkSenses, LISTENING, READING, SENSES, TOPICS } from "./content";

type Lesson = {
  slug: string;
  title: string;
  summary: string;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  topicSlugs: string[];
  body: RichTextDocument;
  exercises?: ExerciseSetInput[];
};

/**
 * Publishes a lesson through the same services editors use (create → review → publish), so seeded data
 * obeys every rule real data does. `extra` runs on the draft before it's reviewed.
 */
export async function seedLesson(
  db: Database,
  siteId: string,
  kind: (typeof schema.resourceKind.enumValues)[number],
  lesson: Lesson,
  extra?: (draftRevisionId: string) => Promise<void>
) {
  const resource = await createResource(db, null, { siteId, kind, locale: "en", ...lesson });
  const localization = one(
    await db.select().from(schema.resourceLocalizations).where(eq(schema.resourceLocalizations.resourceId, resource.id))
  );
  const draftId = localization.draftRevisionId as string;
  if (lesson.exercises?.length) {
    await db.transaction((tx) => addExerciseSets(tx, siteId, draftId, lesson.exercises ?? []));
  }
  await extra?.(draftId);
  await moveDraft(db, null, localization.id, 0, "IN_REVIEW");
  await publishResource(db, null, localization.id, 1);
  return { resourceId: resource.id, localizationId: localization.id, revisionId: draftId };
}

/** Seeds one site with sample lessons. Does nothing if the site already exists. */
export async function seed(db: Database, domain: string, name = "English Skills") {
  const [existing] = await db.select().from(schema.sites).where(eq(schema.sites.domain, domain));
  if (existing) return { siteId: existing.id, created: false, linked: await addVocabularyLinks(db, existing.id) };

  const site = one(await db.insert(schema.sites).values({ domain, name }).returning());
  await db.insert(schema.topics).values(TOPICS.map((t) => ({ siteId: site.id, ...t })));
  await db.insert(schema.examLabels).values(EXAM_LABELS.map((l) => ({ siteId: site.id, ...l })));

  const senseRevisions = new Map<string, string>();
  for (const s of SENSES) {
    const [entry] = await db
      .select({ id: schema.lexicalEntries.id })
      .from(schema.lexicalEntries)
      .where(and(eq(schema.lexicalEntries.siteId, site.id), eq(schema.lexicalEntries.displayForm, s.headword)));
    const senseId = await manageLexicalSense(db, null, {
      siteId: site.id,
      ...(entry ? { entryId: entry.id } : { headword: s.headword, kind: s.kind }),
      senseKey: s.key,
      partOfSpeech: s.partOfSpeech,
      definition: s.definition,
      cefrLevel: s.cefrLevel,
      usageNote: "usageNote" in s ? s.usageNote : null,
      register: "register" in s ? s.register : null,
      examples: s.examples,
      pronunciations: s.pronunciations,
    });
    await publishLexicalSense(db, null, senseId, 0);
    const sense = one(await db.select().from(schema.lexicalSenses).where(eq(schema.lexicalSenses.id, senseId)));
    senseRevisions.set(s.key, sense.publishedRevisionId as string);
  }

  const reading = await seedLesson(
    db,
    site.id,
    "READING",
    { ...READING, body: linkSenses(READING.body, senseRevisions) },
    async (draftId) => {
      const label = one(await db.select().from(schema.examLabels).where(eq(schema.examLabels.siteId, site.id)));
      await db
        .insert(schema.revisionExamLabels)
        .values({ siteId: site.id, revisionId: draftId, examLabelId: label.id });
    }
  );
  const listening = await seedLesson(db, site.id, "LISTENING", {
    ...LISTENING,
    body: linkSenses(LISTENING.body, senseRevisions),
  });
  const collection = await seedLesson(db, site.id, "LEXICAL_COLLECTION", COLLECTION, (draftId) =>
    db.transaction((tx) =>
      setCollectionItems(
        tx,
        site.id,
        draftId,
        COLLECTION.senseKeys.map((k) => senseRevisions.get(k) as string)
      )
    )
  );
  return { siteId: site.id, created: true, reading, listening, collection, senseRevisions };
}

/**
 * For sites seeded before vocabulary links existed: publishes a new revision of the sample lessons with the
 * links, through the normal draft → review → publish flow. Does nothing once a lesson has links, and never
 * touches lessons that aren't the samples.
 */
async function addVocabularyLinks(db: Database, siteId: string): Promise<number> {
  const revisions = new Map<string, string>();
  for (const s of await db.select().from(schema.lexicalSenses).where(eq(schema.lexicalSenses.siteId, siteId))) {
    if (s.publishedRevisionId) revisions.set(s.senseKey, s.publishedRevisionId);
  }
  let linked = 0;
  for (const lesson of [READING, LISTENING]) {
    const [loc] = await db
      .select()
      .from(schema.resourceLocalizations)
      .where(and(eq(schema.resourceLocalizations.siteId, siteId), eq(schema.resourceLocalizations.slug, lesson.slug)));
    if (!loc?.publishedRevisionId || loc.draftRevisionId) continue;
    const annotated = await db
      .select({ id: schema.lexicalAnnotations.id })
      .from(schema.lexicalAnnotations)
      .where(eq(schema.lexicalAnnotations.revisionId, loc.publishedRevisionId))
      .limit(1);
    if (annotated.length) continue;
    await startDraft(db, null, loc.id);
    const started = one(
      await db.select().from(schema.resourceLocalizations).where(eq(schema.resourceLocalizations.id, loc.id))
    );
    const draft = one(
      await db
        .select()
        .from(schema.resourceRevisions)
        .where(eq(schema.resourceRevisions.id, started.draftRevisionId as string))
    );
    await updateDraft(db, null, {
      localizationId: loc.id,
      lockVersion: draft.lockVersion,
      body: linkSenses(lesson.body, revisions),
    });
    await moveDraft(db, null, loc.id, draft.lockVersion + 1, "IN_REVIEW");
    await publishResource(db, null, loc.id, draft.lockVersion + 2);
    linked += 1;
  }
  return linked;
}
