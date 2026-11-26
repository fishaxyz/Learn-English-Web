import { schema, type Database } from "@english/database";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { conflict, invalid, notFound, translateDbErrors } from "../../errors";
import type { RevisionModel } from "../../models";
import { copyExerciseSets } from "../assessment/service";
import { audit } from "../audit";
import { one } from "../../rows";
import { copyTracks, parseSpeakerNames, prepareTracksForPublish } from "../audio/service";
import { dropStaleQuestionSuggestions } from "../assessment/suggestions";
import { publishLinkedDrafts } from "../lexicon/service";
import { dropStaleSuggestions } from "../lexicon/suggestions";
import { copyTranslations, syncTranslations } from "../translations/service";
import { assertComplete, type LessonPart } from "./checklist";
import { replaceExerciseSets } from "../assessment/service";
import type { ExerciseSetInput } from "../assessment/schemas";
import {
  annotationsOf,
  EMPTY_DOCUMENT,
  parseRichText,
  plainTextOf,
  RICH_TEXT_SCHEMA_VERSION,
  type RichTextDocument,
} from "../rich-text";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Kind = (typeof schema.resourceKind.enumValues)[number];
type Level = (typeof schema.cefrLevel.enumValues)[number];

const { resources, resourceLocalizations: loc, resourceRevisions: rev } = schema;

const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function checkText(title: string | null | undefined, summary: string | null | undefined) {
  if (title !== undefined && title !== null && (title.trim().length < 1 || title.length > 200)) {
    throw invalid("The title must be 1 to 200 characters");
  }
  if (summary && summary.length > 1000) throw invalid("The summary must be at most 1000 characters");
}

/** Which site a localization belongs to, so the caller can authorize before anything else happens. */
export async function siteOfLocalization(db: Database, localizationId: string): Promise<string | null> {
  const [row] = await db.select({ siteId: loc.siteId }).from(loc).where(eq(loc.id, localizationId)).limit(1);
  return row?.siteId ?? null;
}

export async function siteOfResource(db: Database, resourceId: string): Promise<string | null> {
  const [row] = await db
    .select({ siteId: resources.siteId })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  return row?.siteId ?? null;
}

async function setTopics(tx: Tx, siteId: string, revisionId: string, slugs: string[]) {
  const unique = [...new Set(slugs)];
  const found = unique.length
    ? await tx
        .select({ id: schema.topics.id, slug: schema.topics.slug })
        .from(schema.topics)
        .where(and(eq(schema.topics.siteId, siteId), inArray(schema.topics.slug, unique)))
    : [];
  const missing = unique.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length) throw invalid(`Unknown topic: ${missing.join(", ")}`);
  await tx.delete(schema.revisionTopics).where(eq(schema.revisionTopics.revisionId, revisionId));
  if (found.length) {
    await tx.insert(schema.revisionTopics).values(found.map((t) => ({ siteId, revisionId, topicId: t.id })));
  }
}

/** Re-derives a draft's vocabulary links from its text, so they always match it (AGENTS.md §5.2). */
export async function writeAnnotations(tx: Tx, siteId: string, revisionId: string, doc: RichTextDocument) {
  await tx.delete(schema.lexicalAnnotations).where(eq(schema.lexicalAnnotations.revisionId, revisionId));
  const annotations = annotationsOf(doc);
  if (annotations.length) {
    await tx.insert(schema.lexicalAnnotations).values(annotations.map((a) => ({ ...a, siteId, revisionId })));
  }
}

/** The localization, locked for the rest of the transaction so two publishes can't interleave. */
export async function lockLocalization(tx: Tx, localizationId: string) {
  const [row] = await tx.select().from(loc).where(eq(loc.id, localizationId)).for("update").limit(1);
  if (!row) throw notFound("Resource");
  return row;
}

export async function draftOf(tx: Tx, draftRevisionId: string | null, lockVersion: number): Promise<RevisionModel> {
  if (!draftRevisionId) throw conflict("There's no draft: start one first");
  const [draft] = await tx.select().from(rev).where(eq(rev.id, draftRevisionId)).limit(1);
  if (!draft) throw notFound("Draft");
  if (draft.lockVersion !== lockVersion) throw conflict("Someone else changed this draft; reload it");
  return draft;
}

/** Whether a web address is free on the site, and the first free one like it ("sasas", "sasas-2"...). */
export async function slugAvailability(db: Database, siteId: string, slug: string) {
  if (!SLUG.test(slug) || slug.length > 120) throw invalid("The slug must be lowercase words joined by -");
  const base = slug.replace(/-\d+$/, "");
  const rows = await db
    .select({ slug: loc.slug })
    .from(loc)
    .where(
      and(
        eq(loc.siteId, siteId),
        sql`(${loc.slug} = ${slug} or ${loc.slug} = ${base} or ${loc.slug} like ${`${base}-%`})`
      )
    );
  const used = new Set(rows.map((r) => r.slug));
  if (!used.has(slug)) return { available: true, suggestion: slug };
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate) && candidate.length <= 120) return { available: false, suggestion: candidate };
  }
  return { available: false, suggestion: `${base}-${Date.now().toString(36)}` };
}

export type CreateResource = {
  siteId: string;
  kind: Kind;
  locale: string;
  slug: string;
  title: string;
  summary?: string | null;
  cefrLevel?: Level | null;
  body?: unknown;
  topicSlugs?: string[] | null;
  speakerNames?: { host1?: string | null; host2?: string | null } | null;
};

export async function createResource(db: Database, actorUserId: string | null, input: CreateResource) {
  if (!LOCALE.test(input.locale)) throw invalid("The locale must look like en or en-GB");
  if (!SLUG.test(input.slug) || input.slug.length > 120) throw invalid("The slug must be lowercase words joined by -");
  checkText(input.title, input.summary);
  const body = input.body === undefined || input.body === null ? EMPTY_DOCUMENT : parseRichText(input.body);

  return translateDbErrors(
    () =>
      db.transaction(async (tx) => {
        const resource = one(
          await tx
            .insert(resources)
            .values({ siteId: input.siteId, kind: input.kind, authorId: actorUserId })
            .returning()
        );
        const localization = one(
          await tx
            .insert(loc)
            .values({ siteId: input.siteId, resourceId: resource.id, locale: input.locale, slug: input.slug })
            .returning()
        );
        const draft = one(
          await tx
            .insert(rev)
            .values({
              siteId: input.siteId,
              localizationId: localization.id,
              revisionNo: 1,
              title: input.title.trim(),
              summary: input.summary ?? null,
              cefrLevel: input.cefrLevel ?? null,
              richText: body,
              plainText: plainTextOf(body),
              speakerNames: parseSpeakerNames(input.speakerNames),
              schemaVersion: RICH_TEXT_SCHEMA_VERSION,
              createdBy: actorUserId,
            })
            .returning()
        );
        await tx.update(loc).set({ draftRevisionId: draft.id }).where(eq(loc.id, localization.id));
        if (input.topicSlugs) await setTopics(tx, input.siteId, draft.id, input.topicSlugs);
        await writeAnnotations(tx, input.siteId, draft.id, body);
        await audit(tx, {
          siteId: input.siteId,
          actorUserId,
          action: "resource.created",
          entityType: "resource",
          entityId: resource.id,
          data: { kind: input.kind, locale: input.locale, slug: input.slug },
        });
        return resource;
      }),
    { unique: "That slug is already used on this site" }
  );
}

/** A new draft from the published revision: every attached part is copied, so the published one stays frozen. */
export async function startDraft(db: Database, actorUserId: string | null, localizationId: string) {
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, localizationId);
      if (l.draftRevisionId) throw conflict("A draft already exists");
      if (!l.publishedRevisionId) throw conflict("Nothing is published to start from");
      const published = one(await tx.select().from(rev).where(eq(rev.id, l.publishedRevisionId)));
      const [{ last } = { last: 0 }] = await tx
        .select({ last: max(rev.revisionNo) })
        .from(rev)
        .where(eq(rev.localizationId, l.id));
      const p = published;
      const draft = one(
        await tx
          .insert(rev)
          .values({
            siteId: p.siteId,
            localizationId: l.id,
            revisionNo: (last ?? 0) + 1,
            title: p.title,
            summary: p.summary,
            cefrLevel: p.cefrLevel,
            richText: p.richText,
            plainText: p.plainText,
            speakerNames: p.speakerNames,
            seoTitle: p.seoTitle,
            seoDescription: p.seoDescription,
            schemaVersion: p.schemaVersion,
            createdBy: actorUserId,
          })
          .returning()
      );
      const d = draft;
      await tx.execute(sql`
        insert into revision_topics (site_id, revision_id, topic_id)
          select site_id, ${d.id}, topic_id from revision_topics where revision_id = ${p.id}`);
      await tx.execute(sql`
        insert into revision_exam_labels (site_id, revision_id, exam_label_id)
          select site_id, ${d.id}, exam_label_id from revision_exam_labels where revision_id = ${p.id}`);
      await tx.execute(sql`
        insert into revision_media (site_id, revision_id, asset_id, role, position)
          select site_id, ${d.id}, asset_id, role, position from revision_media where revision_id = ${p.id}`);
      await tx.execute(sql`
        insert into collection_items (site_id, revision_id, sense_revision_id, position)
          select site_id, ${d.id}, sense_revision_id, position from collection_items where revision_id = ${p.id}`);
      await tx.execute(sql`
        insert into lexical_annotations (site_id, revision_id, block_id, start, "end", surface_text, sense_revision_id, is_key)
          select site_id, ${d.id}, block_id, start, "end", surface_text, sense_revision_id, is_key
          from lexical_annotations where revision_id = ${p.id}`);
      await copyExerciseSets(tx, p.siteId, p.id, d.id);
      await copyTracks(tx, p.id, d.id);
      await copyTranslations(tx, p.id, d.id);
      await tx.update(loc).set({ draftRevisionId: d.id }).where(eq(loc.id, l.id));
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "draft.started",
        entityType: "revision",
        entityId: d.id,
      });
      return l.resourceId;
    })
  );
}

export type UpdateDraft = {
  localizationId: string;
  lockVersion: number;
  title?: string | null;
  summary?: string | null;
  cefrLevel?: Level | null;
  body?: unknown;
  topicSlugs?: string[] | null;
  speakerNames?: { host1?: string | null; host2?: string | null } | null;
};

export async function updateDraft(db: Database, actorUserId: string | null, input: UpdateDraft) {
  checkText(input.title, input.summary);
  const body = input.body === undefined || input.body === null ? undefined : parseRichText(input.body);
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, input.localizationId);
      const draft = await draftOf(tx, l.draftRevisionId, input.lockVersion);
      if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
      await tx
        .update(rev)
        .set({
          ...(input.title ? { title: input.title.trim() } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.cefrLevel !== undefined ? { cefrLevel: input.cefrLevel } : {}),
          ...(body ? { richText: body, plainText: plainTextOf(body) } : {}),
          ...(input.speakerNames !== undefined ? { speakerNames: parseSpeakerNames(input.speakerNames) } : {}),
          lockVersion: draft.lockVersion + 1,
        })
        .where(and(eq(rev.id, draft.id), eq(rev.lockVersion, draft.lockVersion)));
      if (input.topicSlugs) await setTopics(tx, l.siteId, draft.id, input.topicSlugs);
      if (body) {
        await writeAnnotations(tx, l.siteId, draft.id, body);
        // Suggestions start from their buttons (Suggest vocabulary / questions); a new text only clears the
        // pending ones made for the old text.
        await dropStaleSuggestions(tx, draft.id, body);
        await dropStaleQuestionSuggestions(tx, draft.id, body);
        // Translations follow the script: changed sentences are translated again, as drafts to check.
        await syncTranslations(tx, draft, body, actorUserId);
      }
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "draft.updated",
        entityType: "revision",
        entityId: draft.id,
      });
      return l.resourceId;
    })
  );
}

/** DRAFT → IN_REVIEW (submit) or IN_REVIEW → DRAFT (return to the editor). */
export async function moveDraft(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  lockVersion: number,
  to: "IN_REVIEW" | "DRAFT",
  note?: string | null,
  required: readonly LessonPart[] = []
) {
  if (note && note.length > 2000) throw invalid("The note must be at most 2000 characters");
  return db.transaction(async (tx) => {
    const l = await lockLocalization(tx, localizationId);
    const draft = await draftOf(tx, l.draftRevisionId, lockVersion);
    const from = to === "IN_REVIEW" ? "DRAFT" : "IN_REVIEW";
    if (draft.status !== from) throw conflict(to === "IN_REVIEW" ? "It's already in review" : "It isn't in review");
    if (to === "IN_REVIEW") await assertComplete(tx, l.resourceId, draft, required);
    await tx
      .update(rev)
      .set({ status: to, submittedAt: to === "IN_REVIEW" ? new Date() : null, lockVersion: draft.lockVersion + 1 })
      .where(eq(rev.id, draft.id));
    await audit(tx, {
      siteId: l.siteId,
      actorUserId,
      action: to === "IN_REVIEW" ? "draft.submitted" : "draft.returned",
      entityType: "revision",
      entityId: draft.id,
      ...(note ? { data: { note } } : {}),
    });
    return l.resourceId;
  });
}

/**
 * IN_REVIEW → PUBLISHED, atomically (AGENTS.md §5.1): the previous published revision becomes SUPERSEDED
 * (unchanged otherwise), the pointers move, and the draft pointer clears. Collections may only pin frozen
 * (published) sense revisions.
 */
export async function publishResource(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  lockVersion: number,
  options: { skipReview?: boolean; required?: readonly LessonPart[] } = {}
) {
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, localizationId);
      const draft = await draftOf(tx, l.draftRevisionId, lockVersion);
      // "Publish now" (admins and owners) may skip the review queue; everyone else publishes reviewed drafts.
      if (draft.status !== "IN_REVIEW" && !(options.skipReview && draft.status === "DRAFT")) {
        throw conflict("Only a reviewed draft can be published: submit it for review");
      }
      // Collections and vocabulary links may only pin published (frozen) sense revisions. For now, the draft
      // meanings a lesson links to are published with it: they were approved as suggestions (ADR 0007).
      const linked = await tx.execute(sql`
        select r.id from lexical_sense_revisions r
        where r.status in ('DRAFT', 'IN_REVIEW') and r.id in (
          select sense_revision_id from collection_items where revision_id = ${draft.id}
          union select sense_revision_id from lexical_annotations where revision_id = ${draft.id})`);
      await publishLinkedDrafts(
        tx,
        actorUserId,
        (linked as unknown as { id: string }[]).map((r) => r.id)
      );
      const unpublished = await tx.execute(sql`
        select 1 from lexical_sense_revisions r
        where r.status in ('DRAFT', 'IN_REVIEW') and r.id in (
          select sense_revision_id from collection_items where revision_id = ${draft.id}
          union select sense_revision_id from lexical_annotations where revision_id = ${draft.id})
        limit 1`);
      if (unpublished.length) throw conflict("Publish the linked word senses first");
      await assertComplete(tx, l.resourceId, draft, options.required ?? []);
      await prepareTracksForPublish(tx, draft.id, draft.richText as RichTextDocument);

      if (l.publishedRevisionId) {
        await tx.update(rev).set({ status: "SUPERSEDED" }).where(eq(rev.id, l.publishedRevisionId));
      }
      await tx
        .update(rev)
        .set({
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedBy: actorUserId,
          submittedAt: draft.submittedAt ?? new Date(),
          lockVersion: draft.lockVersion + 1,
        })
        .where(eq(rev.id, draft.id));
      await tx.update(loc).set({ publishedRevisionId: draft.id, draftRevisionId: null }).where(eq(loc.id, l.id));
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "resource.published",
        entityType: "revision",
        entityId: draft.id,
        data: {
          revisionNo: draft.revisionNo,
          superseded: l.publishedRevisionId,
          ...(draft.status === "DRAFT" ? { skippedReview: true } : {}),
        },
      });
      return l.resourceId;
    })
  );
}

export async function archiveResource(db: Database, actorUserId: string | null, resourceId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(resources)
      .set({ archivedAt: sql`coalesce(${resources.archivedAt}, now())` })
      .where(eq(resources.id, resourceId))
      .returning();
    if (!row) throw notFound("Resource");
    await audit(tx, {
      siteId: row.siteId,
      actorUserId,
      action: "resource.archived",
      entityType: "resource",
      entityId: row.id,
    });
    return row.id;
  });
}

/** Seed and tests: pins sense revisions into a collection draft. */
export async function setCollectionItems(tx: Tx, siteId: string, revisionId: string, senseRevisionIds: string[]) {
  await tx.delete(schema.collectionItems).where(eq(schema.collectionItems.revisionId, revisionId));
  if (senseRevisionIds.length) {
    await tx
      .insert(schema.collectionItems)
      .values(senseRevisionIds.map((senseRevisionId, position) => ({ siteId, revisionId, senseRevisionId, position })));
  }
}

/** Replaces a draft's exercises. Validated whole: one bad question and nothing is written. */
export async function saveExerciseSets(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  lockVersion: number,
  sets: ExerciseSetInput[]
) {
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, localizationId);
      const draft = await draftOf(tx, l.draftRevisionId, lockVersion);
      if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
      await replaceExerciseSets(tx, l.siteId, draft.id, sets);
      await tx
        .update(rev)
        .set({ lockVersion: draft.lockVersion + 1 })
        .where(eq(rev.id, draft.id));
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "exercises.saved",
        entityType: "revision",
        entityId: draft.id,
      });
      return l.resourceId;
    })
  );
}

/** A site's resources for the dashboard, most recently created first. */
export async function editorialResources(db: Database, siteId: string, first: number) {
  return db
    .select()
    .from(resources)
    .where(eq(resources.siteId, siteId))
    .orderBy(sql`${resources.createdAt} desc`, sql`${resources.id} desc`)
    .limit(Math.min(Math.max(first, 1), 100));
}
