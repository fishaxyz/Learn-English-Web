import { schema, type Database } from "@english/database";
import { and, asc, desc, eq, exists, isNotNull, max, or, sql } from "drizzle-orm";
import { conflict, invalid, notFound, translateDbErrors } from "../../errors";
import type { LexicalEntryModel } from "../../models";
import { audit } from "../audit";
import { one } from "../../rows";
import { pageSize } from "../resources/cursor";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Level = (typeof schema.cefrLevel.enumValues)[number];
type EntryKind = (typeof schema.lexicalEntryKind.enumValues)[number];

const { lexicalEntries: entries, lexicalSenses: senses, lexicalSenseRevisions: senseRevs } = schema;

/**
 * The search form of a headword: Unicode NFC, straight apostrophes, single spaces, lowercase. A search aid
 * only; the entry keeps its original display form (AGENTS.md §5.3).
 */
export function normalizeHeadword(text: string): string {
  return text.normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

const hasPublishedSense = (db: Database) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(senses)
      .where(and(eq(senses.entryId, entries.id), isNotNull(senses.publishedRevisionId)))
  );

/**
 * Exact matches first, then prefix matches, then fuzzy (trigram) matches. Only entries with at least one
 * published sense: drafts never appear.
 */
export async function lexicalSearch(db: Database, siteId: string, query: string, first: number) {
  const limit = pageSize(first);
  const q = normalizeHeadword(query).slice(0, 100);
  if (!q) return [];
  const prefix = q.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
  return db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.siteId, siteId),
        hasPublishedSense(db),
        or(
          eq(entries.normalizedHeadword, q),
          sql`${entries.normalizedHeadword} like ${prefix}`,
          sql`${entries.normalizedHeadword} % ${q}`
        )
      )
    )
    .orderBy(
      desc(sql`${entries.normalizedHeadword} = ${q}`),
      desc(sql`${entries.normalizedHeadword} like ${prefix}`),
      desc(sql`similarity(${entries.normalizedHeadword}, ${q})`),
      asc(entries.normalizedHeadword),
      asc(entries.id)
    )
    .limit(limit);
}

export async function lexicalEntryById(db: Database, siteId: string, id: string): Promise<LexicalEntryModel | null> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.siteId, siteId), hasPublishedSense(db)))
    .limit(1);
  return row ?? null;
}

export type ManageSense = {
  siteId: string;
  senseId?: string | null;
  entryId?: string | null;
  headword?: string | null;
  kind?: EntryKind | null;
  partOfSpeech: string;
  senseKey: string;
  definition: string;
  cefrLevel?: Level | null;
  usageNote?: string | null;
  register?: string | null;
  examples: { sentence: string; explanation?: string | null }[];
  pronunciations: { accent: string; ipa: string }[];
  /** The meaning in learners' languages, e.g. { locale: "vi", text: "quãng đường đi làm" }. */
  translations?: { locale: string; text: string }[];
  lockVersion?: number | null;
};

function check(input: ManageSense) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.senseKey) || input.senseKey.length > 80) {
    throw invalid("The sense key must be lowercase words joined by -, e.g. bank-noun-money");
  }
  if (!/^[a-z][a-z -]{0,29}$/.test(input.partOfSpeech)) throw invalid("Unknown part of speech");
  if (!input.definition.trim() || input.definition.length > 1000)
    throw invalid("The definition must be 1 to 1000 characters");
  if (input.examples.length > 20) throw invalid("At most 20 examples");
  if (input.examples.some((e) => !e.sentence.trim() || e.sentence.length > 500))
    throw invalid("Examples are 1 to 500 characters");
  if (input.pronunciations.length > 6) throw invalid("At most 6 pronunciations");
  const translations = input.translations ?? [];
  if (translations.length > 20) throw invalid("At most 20 translations");
  const locales = new Set<string>();
  for (const t of translations) {
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(t.locale)) throw invalid("Translation languages look like vi, es or pt-BR");
    if (t.locale === "en") throw invalid("English is the definition; translations are for other languages");
    if (locales.has(t.locale)) throw invalid(`Two translations for ${t.locale}`);
    locales.add(t.locale);
    if (!t.text.trim() || t.text.length > 500) throw invalid("Translations are 1 to 500 characters");
  }
  for (const p of input.pronunciations) {
    if (!/^[a-z]{2}-[A-Z]{2}$/.test(p.accent)) throw invalid("Accents look like en-GB or en-US");
    if (!p.ipa.trim() || p.ipa.length > 100) throw invalid("IPA is 1 to 100 characters");
  }
}

async function writeParts(tx: Tx, siteId: string, revisionId: string, input: ManageSense) {
  await tx.delete(schema.lexicalExamples).where(eq(schema.lexicalExamples.senseRevisionId, revisionId));
  await tx.delete(schema.lexicalPronunciations).where(eq(schema.lexicalPronunciations.senseRevisionId, revisionId));
  await tx.delete(schema.lexicalGlosses).where(eq(schema.lexicalGlosses.senseRevisionId, revisionId));
  const translations = input.translations ?? [];
  if (translations.length) {
    await tx
      .insert(schema.lexicalGlosses)
      .values(translations.map((t) => ({ senseRevisionId: revisionId, locale: t.locale, text: t.text.trim() })));
  }
  if (input.examples.length) {
    await tx.insert(schema.lexicalExamples).values(
      input.examples.map((e, position) => ({
        senseRevisionId: revisionId,
        sentence: e.sentence.trim(),
        explanation: e.explanation ?? null,
        position,
      }))
    );
  }
  if (input.pronunciations.length) {
    await tx
      .insert(schema.lexicalPronunciations)
      .values(
        input.pronunciations.map((p) => ({ siteId, senseRevisionId: revisionId, accent: p.accent, ipa: p.ipa.trim() }))
      );
  }
}

const content = (input: ManageSense) => ({
  definitionEn: input.definition.trim(),
  cefrLevel: input.cefrLevel ?? null,
  usageNote: input.usageNote ?? null,
  register: input.register ?? null,
});

/** Creates a sense (and entry), edits its draft, or starts a new draft from what's published. Returns the sense id. */
export async function manageLexicalSense(
  db: Database,
  actorUserId: string | null,
  input: ManageSense
): Promise<string> {
  check(input);
  return translateDbErrors(
    () =>
      db.transaction(async (tx) => {
        if (!input.senseId) {
          let entryId = input.entryId ?? null;
          if (entryId) {
            const [entry] = await tx
              .select({ id: entries.id })
              .from(entries)
              .where(and(eq(entries.id, entryId), eq(entries.siteId, input.siteId)));
            if (!entry) throw notFound("Entry");
          } else {
            if (!input.headword?.trim() || !input.kind)
              throw invalid("A new sense needs an entry, or a headword and kind");
            if (input.headword.length > 120) throw invalid("Headwords and patterns are at most 120 characters");
            const entry = one(
              await tx
                .insert(entries)
                .values({
                  siteId: input.siteId,
                  displayForm: input.headword.trim(),
                  normalizedHeadword: normalizeHeadword(input.headword),
                  kind: input.kind,
                })
                .returning({ id: entries.id })
            );
            entryId = entry.id;
          }
          const sense = one(
            await tx
              .insert(senses)
              .values({ siteId: input.siteId, entryId, partOfSpeech: input.partOfSpeech, senseKey: input.senseKey })
              .returning()
          );
          const revision = one(
            await tx
              .insert(senseRevs)
              .values({
                siteId: input.siteId,
                senseId: sense.id,
                revisionNo: 1,
                createdBy: actorUserId,
                ...content(input),
              })
              .returning()
          );
          await writeParts(tx, input.siteId, revision.id, input);
          await tx.update(senses).set({ draftRevisionId: revision.id }).where(eq(senses.id, sense.id));
          await audit(tx, {
            siteId: input.siteId,
            actorUserId,
            action: "sense.created",
            entityType: "lexical_sense",
            entityId: sense.id,
          });
          return sense.id;
        }

        const [sense] = await tx
          .select()
          .from(senses)
          .where(and(eq(senses.id, input.senseId), eq(senses.siteId, input.siteId)))
          .for("update");
        if (!sense) throw notFound("Sense");
        let draftId = sense.draftRevisionId;
        if (draftId) {
          const draft = one(await tx.select().from(senseRevs).where(eq(senseRevs.id, draftId)));
          if (
            input.lockVersion === undefined ||
            input.lockVersion === null ||
            draft.lockVersion !== input.lockVersion
          ) {
            throw conflict("Someone else changed this sense; reload it");
          }
          await tx
            .update(senseRevs)
            .set({ ...content(input), lockVersion: draft.lockVersion + 1 })
            .where(eq(senseRevs.id, draftId));
        } else {
          const [{ last } = { last: 0 }] = await tx
            .select({ last: max(senseRevs.revisionNo) })
            .from(senseRevs)
            .where(eq(senseRevs.senseId, sense.id));
          const revision = one(
            await tx
              .insert(senseRevs)
              .values({
                siteId: input.siteId,
                senseId: sense.id,
                revisionNo: (last ?? 0) + 1,
                createdBy: actorUserId,
                ...content(input),
              })
              .returning()
          );
          draftId = revision.id;
          await tx.update(senses).set({ draftRevisionId: draftId }).where(eq(senses.id, sense.id));
        }
        await tx
          .update(senses)
          .set({ partOfSpeech: input.partOfSpeech, senseKey: input.senseKey })
          .where(eq(senses.id, sense.id));
        await writeParts(tx, input.siteId, draftId, input);
        await audit(tx, {
          siteId: input.siteId,
          actorUserId,
          action: "sense.updated",
          entityType: "lexical_sense",
          entityId: sense.id,
        });
        return sense.id;
      }),
    { unique: "That sense key is already used for this entry" }
  );
}

/** Publishes a sense's draft. The previous revision is superseded, not changed: lessons that pinned it keep it. */
export async function publishLexicalSense(
  db: Database,
  actorUserId: string | null,
  senseId: string,
  lockVersion: number
) {
  return db.transaction(async (tx) => {
    const [sense] = await tx.select().from(senses).where(eq(senses.id, senseId)).for("update");
    if (!sense) throw notFound("Sense");
    if (!sense.draftRevisionId) throw conflict("There's no draft to publish");
    const draft = one(await tx.select().from(senseRevs).where(eq(senseRevs.id, sense.draftRevisionId)));
    if (draft.lockVersion !== lockVersion) throw conflict("Someone else changed this sense; reload it");
    if (sense.publishedRevisionId) {
      await tx.update(senseRevs).set({ status: "SUPERSEDED" }).where(eq(senseRevs.id, sense.publishedRevisionId));
    }
    await tx
      .update(senseRevs)
      .set({ status: "PUBLISHED", publishedAt: new Date(), lockVersion: draft.lockVersion + 1 })
      .where(eq(senseRevs.id, draft.id));
    await tx
      .update(senses)
      .set({ publishedRevisionId: draft.id, draftRevisionId: null })
      .where(eq(senses.id, sense.id));
    await audit(tx, {
      siteId: sense.siteId,
      actorUserId,
      action: "sense.published",
      entityType: "lexical_sense",
      entityId: sense.id,
    });
    return sense.id;
  });
}

export async function siteOfSense(db: Database, senseId: string): Promise<string | null> {
  const [row] = await db.select({ siteId: senses.siteId }).from(senses).where(eq(senses.id, senseId)).limit(1);
  return row?.siteId ?? null;
}

/** A site's senses for the dashboard's word bank, drafts included: by headword, optionally filtered. */
export async function editorialSenses(db: Database, siteId: string, query: string | null | undefined, first: number) {
  const q = normalizeHeadword(query ?? "").slice(0, 100);
  const contains = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({ sense: senses })
    .from(senses)
    .innerJoin(entries, eq(entries.id, senses.entryId))
    .where(and(eq(senses.siteId, siteId), q ? sql`${entries.normalizedHeadword} like ${contains}` : undefined))
    .orderBy(asc(entries.normalizedHeadword), asc(senses.senseKey))
    .limit(Math.min(Math.max(first, 1), 200))
    .then((rows) => rows.map((r) => r.sense));
}
