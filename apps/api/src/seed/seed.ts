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
import { annotationsOf, type RichTextDocument } from "../modules/rich-text";
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
  if (existing) return { siteId: existing.id, created: false, linked: await upgradeSamples(db, existing.id) };

  const site = one(await db.insert(schema.sites).values({ domain, name }).returning());
  await db.insert(schema.topics).values(TOPICS.map((t) => ({ siteId: site.id, ...t })));
  await db.insert(schema.examLabels).values(EXAM_LABELS.map((l) => ({ siteId: site.id, ...l })));

  const senseRevisions = new Map<string, string>();
  for (const s of SENSES) {
    const senseId = await upsertSense(db, site.id, s);
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

/** Creates or updates one sample sense through the normal draft → publish flow. Returns its sense id. */
async function upsertSense(
  db: Database,
  siteId: string,
  s: (typeof SENSES)[number],
  senseId?: string,
  lockVersion?: number
) {
  const [entry] = senseId
    ? []
    : await db
        .select({ id: schema.lexicalEntries.id })
        .from(schema.lexicalEntries)
        .where(and(eq(schema.lexicalEntries.siteId, siteId), eq(schema.lexicalEntries.displayForm, s.headword)));
  const id = await manageLexicalSense(db, null, {
    siteId,
    ...(senseId
      ? { senseId, lockVersion: lockVersion ?? null }
      : entry
        ? { entryId: entry.id }
        : { headword: s.headword, kind: s.kind }),
    senseKey: s.key,
    partOfSpeech: s.partOfSpeech,
    definition: s.definition,
    cefrLevel: s.cefrLevel,
    usageNote: s.usageNote ?? null,
    register: s.register ?? null,
    examples: s.examples,
    pronunciations: s.pronunciations,
    translations: s.translations ?? [],
  });
  const draft = one(
    await db
      .select({ lockVersion: schema.lexicalSenseRevisions.lockVersion })
      .from(schema.lexicalSenseRevisions)
      .innerJoin(schema.lexicalSenses, eq(schema.lexicalSenses.draftRevisionId, schema.lexicalSenseRevisions.id))
      .where(eq(schema.lexicalSenses.id, id))
  );
  await publishLexicalSense(db, null, id, draft.lockVersion);
  return id;
}

/**
 * Brings an existing site's samples up to date, through the same draft → review → publish flow editors use:
 * missing sample senses, missing translations, then the sample lessons' links (key words, the pattern) pinned to
 * the current sense revisions. Does nothing when everything already matches; never touches other content.
 */
async function upgradeSamples(db: Database, siteId: string): Promise<number> {
  let changed = 0;
  const current = async () => db.select().from(schema.lexicalSenses).where(eq(schema.lexicalSenses.siteId, siteId));

  for (const s of SENSES) {
    const sense = (await current()).find((x) => x.senseKey === s.key);
    if (!sense) {
      await upsertSense(db, siteId, s);
      changed += 1;
      continue;
    }
    if (!s.translations?.length || !sense.publishedRevisionId) continue;
    const glosses = await db
      .select({ id: schema.lexicalGlosses.id })
      .from(schema.lexicalGlosses)
      .where(eq(schema.lexicalGlosses.senseRevisionId, sense.publishedRevisionId));
    if (glosses.length) continue;
    const [draft] = sense.draftRevisionId
      ? await db
          .select()
          .from(schema.lexicalSenseRevisions)
          .where(eq(schema.lexicalSenseRevisions.id, sense.draftRevisionId))
      : [];
    await upsertSense(db, siteId, s, sense.id, draft?.lockVersion);
    changed += 1;
  }

  const revisions = new Map<string, string>();
  for (const s of await current()) if (s.publishedRevisionId) revisions.set(s.senseKey, s.publishedRevisionId);

  for (const lesson of [READING, LISTENING]) {
    const [loc] = await db
      .select()
      .from(schema.resourceLocalizations)
      .where(and(eq(schema.resourceLocalizations.siteId, siteId), eq(schema.resourceLocalizations.slug, lesson.slug)));
    if (!loc?.publishedRevisionId) continue;
    const body = linkSenses(lesson.body, revisions);
    const wanted = annotationsOf(body)
      .map((a) => `${a.senseRevisionId}|${a.isKey}`)
      .sort()
      .join();
    const live = (
      await db
        .select()
        .from(schema.lexicalAnnotations)
        .where(eq(schema.lexicalAnnotations.revisionId, loc.publishedRevisionId))
    )
      .map((a) => `${a.senseRevisionId}|${a.isKey}`)
      .sort()
      .join();
    if (wanted === live) continue;
    if (!loc.draftRevisionId) await startDraft(db, null, loc.id);
    const started = one(
      await db.select().from(schema.resourceLocalizations).where(eq(schema.resourceLocalizations.id, loc.id))
    );
    const draft = one(
      await db
        .select()
        .from(schema.resourceRevisions)
        .where(eq(schema.resourceRevisions.id, started.draftRevisionId as string))
    );
    if (draft.status !== "DRAFT") continue; // someone's review is in progress: leave it alone
    await updateDraft(db, null, { localizationId: loc.id, lockVersion: draft.lockVersion, body });
    await moveDraft(db, null, loc.id, draft.lockVersion + 1, "IN_REVIEW");
    await publishResource(db, null, loc.id, draft.lockVersion + 2);
    changed += 1;
  }
  return changed;
}
