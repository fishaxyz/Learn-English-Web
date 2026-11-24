"use client";

import type { CefrLevel, EditorialLessonQuery, EditorialSummaryFragment, SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { fromPayload, toPayload, type EditorSet } from "../lib/exercises";
import { ExercisesEditor } from "./exercises-editor";
import { RichTextEditor } from "./rich-text-editor";

type Lesson = NonNullable<EditorialLessonQuery["editorialResource"]>;
type Localization = Lesson["localizations"][number];
type Role = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const field =
  "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";

const canWrite = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "EDITOR";
const canReview = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "REVIEWER";

/** Sense revision ids linked in a document, in order. */
function linkedIds(doc: JSONContent | undefined): string[] {
  const ids: string[] = [];
  const walk = (n: JSONContent) => {
    for (const m of n.marks ?? []) {
      const id = m.type === "lexical" ? (m.attrs?.["senseRevisionId"] as string | undefined) : undefined;
      if (id && !ids.includes(id)) ids.push(id);
    }
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}

export function LessonEditor({
  lesson,
  localization,
  role,
  topics,
  websiteUrl,
}: {
  lesson: Lesson;
  localization: Localization;
  role: Role | undefined;
  topics: { slug: string; name: string }[];
  websiteUrl: string;
}) {
  const router = useRouter();
  const draft = localization.draft;
  const published = localization.published;

  const [lockVersion, setLockVersion] = useState(draft?.lockVersion ?? 0);
  const [status, setStatus] = useState(draft?.status ?? null);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const [level, setLevel] = useState<CefrLevel | "">(draft?.cefrLevel ?? "");
  const [topicSlugs, setTopicSlugs] = useState<string[]>(draft?.topics.map((t) => t.slug) ?? []);
  const body = useRef<JSONContent | undefined>(draft?.body as JSONContent | undefined);
  const [linked, setLinked] = useState<string[]>(() => linkedIds(draft?.body as JSONContent | undefined));
  const [senses, setSenses] = useState<Record<string, SenseCardFragment>>(
    Object.fromEntries((draft?.vocabulary ?? []).map((s) => [s.revisionId, s]))
  );
  const [sets, setSets] = useState<EditorSet[]>(fromPayload(draft?.exercises));
  const [textDirty, setTextDirty] = useState(false);
  const [exercisesDirty, setExercisesDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = textDirty || exercisesDirty;

  const editable = status === "DRAFT" && canWrite(role) && !lesson.archivedAt;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function after(result: actions.ActionResult, success: string, refresh = true) {
    if (!result.ok) {
      setMessage({ tone: "bad", text: result.message });
      return false;
    }
    const d = result.summary.localizations[0]?.draft;
    setLockVersion(d?.lockVersion ?? 0);
    setStatus(d?.status ?? null);
    setMessage({ tone: "good", text: success });
    if (refresh) router.refresh();
    return true;
  }

  const saveText = () =>
    startTransition(async () => {
      const result = await actions.saveDraft(localization.id, lockVersion, {
        title,
        summary: summary.trim() || null,
        cefrLevel: level || null,
        // Plain JSON: Tiptap's attribute objects aren't plain, and React can't send them to a server action as-is.
        body: JSON.parse(JSON.stringify(body.current ?? { type: "doc", content: [] })) as unknown,
        topicSlugs,
      });
      if (after(result, "Saved.", false)) setTextDirty(false);
    });

  const saveSets = () =>
    startTransition(async () => {
      const payload = toPayload(sets);
      if (typeof payload === "string") return setMessage({ tone: "bad", text: payload });
      const result = await actions.saveExercises(localization.id, lockVersion, payload);
      if (after(result, "Exercises saved.", false)) setExercisesDirty(false);
    });

  const vocabulary = useMemo(
    () => linked.map((id) => senses[id]).filter((s): s is SenseCardFragment => Boolean(s)),
    [linked, senses]
  );

  if (!draft) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <p>
          {lesson.archivedAt
            ? "This lesson is archived: it's no longer on the site."
            : `Published as revision ${published?.revisionNo}. To change it, start a new draft: the live lesson stays as it is until the new draft is published.`}
        </p>
        <div className="flex flex-wrap gap-3">
          {published && !lesson.archivedAt ? (
            <a
              href={`${websiteUrl}/reading/${localization.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-4 py-2 hover:border-accent"
            >
              View on the site
            </a>
          ) : null}
          {canWrite(role) && !lesson.archivedAt ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => void after(await actions.startDraft(localization.id), "New draft started."))
              }
              className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
            >
              Start a new draft
            </button>
          ) : null}
        </div>
        {message ? (
          <p role="status" className={message.tone === "bad" ? "text-bad" : "text-good"}>
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="text-heading" className="flex flex-col gap-4">
          <h2 id="text-heading" className="font-display text-2xl font-semibold">
            Text
          </h2>
          <label htmlFor="title" className="flex flex-col gap-1.5 font-medium">
            Title
            <input
              id="title"
              className={field}
              value={title}
              disabled={!editable}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                setTextDirty(true);
              }}
            />
          </label>
          <label htmlFor="summary" className="flex flex-col gap-1.5 font-medium">
            Summary{" "}
            <span className="text-sm font-normal text-muted">
              One or two sentences, shown in lists and search results.
            </span>
            <textarea
              id="summary"
              className={field}
              rows={2}
              value={summary}
              disabled={!editable}
              maxLength={1000}
              onChange={(e) => {
                setSummary(e.target.value);
                setTextDirty(true);
              }}
            />
          </label>
          <div className="flex flex-wrap items-end gap-6">
            <label htmlFor="level" className="flex flex-col gap-1.5 font-medium">
              Level
              <select
                id="level"
                className={field}
                value={level}
                disabled={!editable}
                onChange={(e) => {
                  setLevel(e.target.value as CefrLevel | "");
                  setTextDirty(true);
                }}
              >
                <option value="">Not set</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <fieldset disabled={!editable} className="flex flex-wrap gap-2">
              <legend className="mb-1.5 font-medium">Topics</legend>
              {topics.map((t) => (
                <label
                  key={t.slug}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    checked={topicSlugs.includes(t.slug)}
                    onChange={(e) => {
                      setTopicSlugs(
                        e.target.checked ? [...topicSlugs, t.slug] : topicSlugs.filter((s) => s !== t.slug)
                      );
                      setTextDirty(true);
                    }}
                  />
                  {t.name}
                </label>
              ))}
            </fieldset>
          </div>
          <RichTextEditor
            initial={draft.body}
            editable={editable}
            onChange={(doc) => {
              body.current = doc;
              setLinked(linkedIds(doc));
              setTextDirty(true);
            }}
            searchSenses={(q) => actions.searchSenses(lesson.site.domain, q)}
            onSenseChosen={(s) => setSenses((prev) => ({ ...prev, [s.revisionId]: s }))}
          />
          {editable ? (
            <button
              type="button"
              onClick={saveText}
              disabled={pending || !textDirty}
              className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              {pending ? "Saving…" : textDirty ? "Save text" : "Text saved"}
            </button>
          ) : null}
        </section>

        <section aria-labelledby="exercises-heading" className="flex flex-col gap-4">
          <h2 id="exercises-heading" className="font-display text-2xl font-semibold">
            Exercises
          </h2>
          <ExercisesEditor
            sets={sets}
            disabled={!editable}
            onChange={(next) => {
              setSets(next);
              setExercisesDirty(true);
            }}
          />
          {editable ? (
            <button
              type="button"
              onClick={saveSets}
              disabled={pending || !exercisesDirty}
              className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              {pending ? "Saving…" : exercisesDirty ? "Save exercises" : "Exercises saved"}
            </button>
          ) : null}
        </section>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            {status === "IN_REVIEW" ? "In review" : "Draft"} · revision {draft.revisionNo}
            {published ? ` · revision ${published.revisionNo} is live` : " · not published yet"}
          </p>
          <Link
            href={`/lessons/${lesson.id}/preview`}
            target="_blank"
            className="rounded-full border border-line px-4 py-2 text-center hover:border-accent"
          >
            Preview
          </Link>
          {status === "DRAFT" && canWrite(role) ? (
            <button
              type="button"
              disabled={pending || dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() =>
                startTransition(
                  async () =>
                    void after(await actions.submitForReview(localization.id, lockVersion), "Sent for review.")
                )
              }
              className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              Submit for review
            </button>
          ) : null}
          {status === "IN_REVIEW" && canReview(role) ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(
                    async () =>
                      void after(
                        await actions.publish(localization.id, lockVersion),
                        "Published. It's live on the site."
                      )
                  )
                }
                className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
              >
                Publish
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const note = window.prompt("What should the editor change? (optional)");
                  if (note === null) return;
                  startTransition(
                    async () =>
                      void after(
                        await actions.returnToDraft(localization.id, lockVersion, note.trim() || null),
                        "Returned to the editor."
                      )
                  );
                }}
                className="rounded-full border border-line px-4 py-2 hover:border-accent disabled:opacity-50"
              >
                Return to editor
              </button>
            </>
          ) : null}
          {status === "IN_REVIEW" && !canReview(role) ? (
            <p className="text-sm text-muted">Waiting for a reviewer.</p>
          ) : null}
          <div aria-live="polite">
            {message ? (
              <p className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>{message.text}</p>
            ) : null}
            {dirty && editable ? <p className="text-sm text-muted">You have unsaved changes.</p> : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Linked words</h2>
          {vocabulary.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {vocabulary.map((s) => (
                <li key={s.revisionId}>
                  <span className="font-semibold">{s.entry.displayForm}</span>{" "}
                  <span className="text-muted">{s.definition}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Select a word in the text, then choose “Link word”.</p>
          )}
        </div>

        {(role === "OWNER" || role === "ADMIN") && published && !lesson.archivedAt ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Archive this lesson? It disappears from the site; nothing is deleted.")) return;
              startTransition(async () => void after(await actions.archive(lesson.id), "Archived."));
            }}
            className="rounded-full border border-line px-4 py-2 text-sm text-bad hover:border-bad"
          >
            Archive lesson
          </button>
        ) : null}
      </aside>
    </div>
  );
}

export type { EditorialSummaryFragment };
