import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  answerKeys,
  exerciseSets,
  questions,
  resourceLocalizations,
  resourceRevisions,
  resources,
  revisionTopics,
  sites,
  topics,
} from "../src/schema";
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from "../src/testing";

const doc = { type: "doc", content: [] };

describe.skipIf(!testDatabaseUrl)("database integrity", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  /** A site with one resource, localization and draft revision. */
  async function lesson(domain: string) {
    const [site] = await t.db.insert(sites).values({ domain, name: domain }).returning();
    const [resource] = await t.db.insert(resources).values({ siteId: site!.id, kind: "READING" }).returning();
    const [loc] = await t.db
      .insert(resourceLocalizations)
      .values({ siteId: site!.id, resourceId: resource!.id, locale: "en", slug: "first-lesson" })
      .returning();
    const [rev] = await t.db
      .insert(resourceRevisions)
      .values({ siteId: site!.id, localizationId: loc!.id, revisionNo: 1, title: "First", richText: doc })
      .returning();
    return { site: site!, resource: resource!, loc: loc!, rev: rev! };
  }

  /** The Postgres error behind a failed query (Drizzle wraps it). */
  async function failure(query: PromiseLike<unknown>) {
    try {
      await query;
    } catch (error) {
      const cause = (error as { cause?: { code?: string; message?: string } }).cause ?? error;
      return cause as { code?: string; message?: string };
    }
    throw new Error("expected the query to fail");
  }

  it("migrates a fresh database, with pg_trgm", async () => {
    const rows = await t.db.execute(sql`select extname from pg_extension where extname = 'pg_trgm'`);
    expect(rows.length).toBe(1);
  });

  it("refuses to link one site's revision to another site's topic", async () => {
    const a = await lesson("a.test");
    const b = await lesson("b.test");
    const [topicB] = await t.db
      .insert(topics)
      .values({ siteId: b.site.id, slug: "travel", name: "Travel" })
      .returning();
    // Claiming site A while pointing at site B's topic breaks the composite foreign key.
    const error = await failure(
      t.db.insert(revisionTopics).values({ siteId: a.site.id, revisionId: a.rev.id, topicId: topicB!.id })
    );
    expect(error.code).toBe("23503"); // foreign_key_violation
  });

  it("refuses a draft pointer to another localization's revision", async () => {
    const a = await lesson("c.test");
    const other = await lesson("d.test");
    const error = await failure(
      t.db.transaction(async (tx) => {
        await tx
          .update(resourceLocalizations)
          .set({ draftRevisionId: other.rev.id })
          .where(eq(resourceLocalizations.id, a.loc.id));
      })
    );
    expect(error.code).toBe("23503");
  });

  it("freezes a published revision: no edits, no deletes; superseding is the only change", async () => {
    const a = await lesson("e.test");
    await t.db
      .update(resourceRevisions)
      .set({ status: "PUBLISHED", publishedAt: new Date() })
      .where(eq(resourceRevisions.id, a.rev.id));

    const edit = await failure(
      t.db.update(resourceRevisions).set({ title: "Changed" }).where(eq(resourceRevisions.id, a.rev.id))
    );
    expect(edit.message).toContain("immutable");

    const remove = await failure(t.db.delete(resourceRevisions).where(eq(resourceRevisions.id, a.rev.id)));
    expect(remove.message).toContain("immutable");

    await t.db.update(resourceRevisions).set({ status: "SUPERSEDED" }).where(eq(resourceRevisions.id, a.rev.id));
    const back = await failure(
      t.db.update(resourceRevisions).set({ status: "DRAFT" }).where(eq(resourceRevisions.id, a.rev.id))
    );
    expect(back.message).toContain("immutable");
  });

  it("freezes everything attached to a published revision, down to answer keys", async () => {
    const a = await lesson("f.test");
    const [set] = await t.db
      .insert(exerciseSets)
      .values({ siteId: a.site.id, revisionId: a.rev.id, title: "Check" })
      .returning();
    const [q] = await t.db
      .insert(questions)
      .values({
        siteId: a.site.id,
        exerciseSetId: set!.id,
        type: "TRUE_FALSE_NOT_GIVEN",
        promptJson: { statement: "x" },
      })
      .returning();
    await t.db
      .insert(answerKeys)
      .values({ questionId: q!.id, gradingJson: { type: "TRUE_FALSE_NOT_GIVEN", answer: "TRUE" } });

    await t.db
      .update(resourceRevisions)
      .set({ status: "PUBLISHED", publishedAt: new Date() })
      .where(eq(resourceRevisions.id, a.rev.id));

    const key = await failure(
      t.db
        .update(answerKeys)
        .set({ gradingJson: { type: "TRUE_FALSE_NOT_GIVEN", answer: "FALSE" } })
        .where(eq(answerKeys.questionId, q!.id))
    );
    expect(key.message).toContain("immutable");
    const added = await failure(
      t.db.insert(questions).values({
        siteId: a.site.id,
        exerciseSetId: set!.id,
        type: "TRUE_FALSE_NOT_GIVEN",
        promptJson: { statement: "y" },
      })
    );
    expect(added.message).toContain("immutable");
  });

  it("keeps slugs unique per site and locale, and well-formed", async () => {
    const a = await lesson("g.test");
    const [r2] = await t.db.insert(resources).values({ siteId: a.site.id, kind: "READING" }).returning();
    const duplicate = await failure(
      t.db
        .insert(resourceLocalizations)
        .values({ siteId: a.site.id, resourceId: r2!.id, locale: "en", slug: "first-lesson" })
    );
    expect(duplicate.code).toBe("23505"); // unique_violation
    const bad = await failure(
      t.db
        .insert(resourceLocalizations)
        .values({ siteId: a.site.id, resourceId: r2!.id, locale: "en", slug: "Not A Slug" })
    );
    expect(bad.code).toBe("23514"); // check_violation
  });
});
