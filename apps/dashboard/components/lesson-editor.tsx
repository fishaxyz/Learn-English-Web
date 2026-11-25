"use client";

import type { CefrLevel, EditorialLessonQuery, EditorialSummaryFragment, SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { fromPayload, toPayload, type EditorSet } from "../lib/exercises";
import { EditorSection, StateChip, useCollapsed, type SectionState } from "./editor-section";
import { ExercisesEditor } from "./exercises-editor";
import { voiceText } from "../lib/voice-text";
import { VoiceoverPanel } from "./voiceover-panel";
import { RichTextEditor } from "./rich-text-editor";

type Lesson = NonNullable<EditorialLessonQuery["editorialResource"]>;
type Localization = Lesson["localizations"][number];
type Role = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SECTION_IDS = ["script", "voice", "vocabulary", "questions"] as const;
type SectionId = (typeof SECTION_IDS)[number];
const TITLES = ["Script", "Voice-over", "Lexical vocabulary", "Questions & quizzes"];
const TINTS = ["bg-pink", "bg-sky", "bg-sun", "bg-good-soft"];
const smallButton = "rounded-full border border-line px-3 py-1 hover:border-ink";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Each part's one-line summary and state, for its header and the side list. */
function sectionStates(p: {
  words: number;
  level: string;
  textDirty: boolean;
  tracks: { status: string; stale: boolean }[];
  vocabulary: SenseCardFragment[];
  keys: Set<string>;
  sets: EditorSet[];
  exercisesDirty: boolean;
}): Record<SectionId, { summary: string; state: SectionState }> {
  const { words } = p;
  const approved = p.tracks.filter((t) => t.status === "APPROVED").length;
  const making = p.tracks.some((t) => t.status === "GENERATING");
  const needsLook = p.tracks.some((t) => t.status === "FAILED" || t.stale);
  const questions = p.sets.reduce((n, s) => n + s.questions.length, 0);
  return {
    script: {
      summary: words ? `${plural(words, "word")} · ${p.level || "no level yet"}` : "No text yet",
      state: p.textDirty ? "unsaved" : words ? "done" : "todo",
    },
    voice: {
      summary: p.tracks.length
        ? `${plural(p.tracks.length, "voice-over")} · ${approved} approved${making ? " · being made" : ""}`
        : "No voice-overs yet",
      state: needsLook ? "attention" : making ? "working" : approved ? "done" : p.tracks.length ? "working" : "todo",
    },
    vocabulary: {
      summary: p.vocabulary.length
        ? `${plural(p.vocabulary.length, "item")} linked · ${p.keys.size} key`
        : "No words linked yet",
      state: p.textDirty && p.vocabulary.length ? "unsaved" : p.vocabulary.length ? "done" : "todo",
    },
    questions: {
      summary: p.sets.length
        ? `${plural(p.sets.length, "set")} · ${plural(questions, "question")}`
        : "No questions yet",
      state: p.exercisesDirty ? "unsaved" : questions ? "done" : "todo",
    },
  };
}

const countWords = (doc: JSONContent | undefined) => (plainText(doc).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

function plainText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join(" ");
}

const KIND_LABEL: Record<string, string> = {
  WORD: "word",
  PHRASE: "phrase",
  COLLOCATION: "collocation",
  IDIOM: "idiom",
  PHRASAL_VERB: "phrasal verb",
  SENTENCE_PATTERN: "pattern",
};

/** The words and structures linked in the text: what learners can tap and add to their list. */
function VocabularyList({
  vocabulary,
  keys,
  siteId,
  editable,
  onWrite,
}: {
  vocabulary: SenseCardFragment[];
  keys: Set<string>;
  siteId: string;
  editable: boolean;
  onWrite: () => void;
}) {
  const sorted = [...vocabulary].sort((a, b) => Number(keys.has(b.revisionId)) - Number(keys.has(a.revisionId)));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        In the script, select a word or phrase and choose <strong className="text-ink">Link word</strong>; choose{" "}
        <strong className="text-ink">Mark as key word</strong> for the ones learners should see first. Save the script
        to keep the links.
      </p>
      {sorted.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sorted.map((s) => {
            const key = keys.has(s.revisionId);
            return (
              <li
                key={s.revisionId}
                className={`flex flex-col gap-1 rounded-2xl border p-3 ${key ? "border-ink/30 bg-sun/30" : "border-line"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.entry.displayForm}</span>
                  <span className="text-xs italic text-muted">{KIND_LABEL[s.entry.kind] ?? s.partOfSpeech}</span>
                  {s.cefrLevel ? <span className="rounded-full bg-paper px-2 text-xs">{s.cefrLevel}</span> : null}
                  {key ? <span className="ml-auto text-xs font-semibold">★ Key word</span> : null}
                </div>
                <p className="text-sm text-muted">{s.definition}</p>
                {s.translations.length ? (
                  <p className="text-sm">
                    {s.translations.map((t) => (
                      <span key={t.locale} lang={t.locale} className="mr-2">
                        {t.text}
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No words linked yet.
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {editable ? (
          <a href="#script" onClick={onWrite} className={smallButton}>
            Go to the script to link words
          </a>
        ) : null}
        <Link href={`/words?site=${siteId}`} className={smallButton}>
          Open Lexical Studio
        </Link>
      </div>
    </div>
  );
}
const field =
  "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";

const canWrite = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "EDITOR";
const canReview = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "REVIEWER";
const canPublishNow = (r: Role | undefined) => r === "OWNER" || r === "ADMIN";

/** Sense revision ids marked as key words in a document. */
function keyIds(doc: JSONContent | undefined): Set<string> {
  const ids = new Set<string>();
  const walk = (n: JSONContent) => {
    for (const m of n.marks ?? [])
      if (m.type === "lexical" && m.attrs?.["key"]) ids.add(m.attrs["senseRevisionId"] as string);
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}

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
  voiceError,
}: {
  lesson: Lesson;
  localization: Localization;
  role: Role | undefined;
  topics: { slug: string; name: string }[];
  websiteUrl: string;
  /** Why the voice-overs chosen when the lesson was created didn't start, if they didn't. */
  voiceError?: string | null;
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
  const [keys, setKeys] = useState<Set<string>>(() => keyIds(draft?.body as JSONContent | undefined));
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
      // Plain JSON: Tiptap's attribute objects aren't plain, and React can't send them to a server action as-is.
      const saved = JSON.parse(JSON.stringify(body.current ?? { type: "doc", content: [] })) as unknown;
      const result = await actions.saveDraft(localization.id, lockVersion, {
        title,
        summary: summary.trim() || null,
        cefrLevel: level || null,
        body: saved,
        topicSlugs,
      });
      if (!after(result, "Saved.", false)) return;
      setTextDirty(false);
      // Voice-overs read the saved text: count it, and see which voice-overs it made out of date.
      setSavedBody(saved);
      const fresh = await actions.draftTracks(lesson.id);
      if (fresh.ok) setTracks(fresh.tracks);
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
  const [tracks, setTracks] = useState(draft?.audioTracks ?? []);
  const [savedBody, setSavedBody] = useState<unknown>(draft?.body);
  const [words, setWords] = useState(() => countWords(draft?.body as JSONContent | undefined));
  const sections = useCollapsed();
  const parts = sectionStates({ words, level, textDirty, tracks, vocabulary, keys, sets, exercisesDirty });
  // Review and publishing wait for every part (the API checks too); saving never does.
  const unfinished = SECTION_IDS.filter((id) => parts[id].state !== "done");

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
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted">Four parts: open the one you&apos;re working on.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => sections.setAll(SECTION_IDS, false)} className={smallButton}>
              Collapse all
            </button>
            <button type="button" onClick={() => sections.setAll(SECTION_IDS, true)} className={smallButton}>
              Expand all
            </button>
          </div>
        </div>

        <EditorSection
          id="script"
          step={1}
          title="Script"
          summary={parts.script.summary}
          state={parts.script.state}
          tint="bg-pink"
        >
          <div className="flex flex-col gap-4">
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
                setWords(countWords(doc));
                setLinked(linkedIds(doc));
                setKeys(keyIds(doc));
                setTextDirty(true);
              }}
              searchSenses={(q) => actions.searchSenses(lesson.site.domain, q)}
              onSenseChosen={(s) => setSenses((prev) => ({ ...prev, [s.revisionId]: s }))}
              newWordHref={(headword) => `/words/new?${new URLSearchParams({ site: lesson.site.id, headword })}`}
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
          </div>
        </EditorSection>

        <EditorSection
          id="voice"
          step={2}
          title="Voice-over"
          summary={parts.voice.summary}
          state={parts.voice.state}
          tint="bg-sky"
        >
          <VoiceoverPanel
            resourceId={lesson.id}
            localizationId={localization.id}
            siteId={lesson.site.id}
            editable={editable}
            textSaved={!textDirty}
            text={voiceText(savedBody)}
            speakerNames={draft.speakerNames}
            tracks={tracks}
            onTracks={setTracks}
            initialError={voiceError}
          />
        </EditorSection>

        <EditorSection
          id="vocabulary"
          step={3}
          title="Lexical vocabulary"
          summary={parts.vocabulary.summary}
          state={parts.vocabulary.state}
          tint="bg-sun"
        >
          <VocabularyList
            vocabulary={vocabulary}
            keys={keys}
            siteId={lesson.site.id}
            editable={editable}
            onWrite={() => sections.open("script")}
          />
        </EditorSection>

        <EditorSection
          id="questions"
          step={4}
          title="Questions & quizzes"
          summary={parts.questions.summary}
          state={parts.questions.state}
          tint="bg-good-soft"
        >
          <div className="flex flex-col gap-4">
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
          </div>
        </EditorSection>
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            {status === "IN_REVIEW" ? "In review" : "Draft"} · revision {draft.revisionNo}
            {published ? ` · revision ${published.revisionNo} is live` : " · not published yet"}
          </p>
          {unfinished.length && status ? (
            <div className="rounded-2xl bg-sun/50 p-3 text-sm text-on-pastel">
              <p className="font-semibold">Finish before it can go out:</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {unfinished.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={() => sections.open(id)} className="underline underline-offset-2">
                      {TITLES[SECTION_IDS.indexOf(id)]}
                    </a>
                    {parts[id].state === "unsaved" ? " (unsaved)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs opacity-80">You can save at any time.</p>
            </div>
          ) : null}
          <Link
            href={`/lessons/${lesson.id}/preview`}
            target="_blank"
            className="rounded-full border border-line px-4 py-2 text-center hover:border-accent"
          >
            Preview
          </Link>
          {status === "DRAFT" && canPublishNow(role) ? (
            <button
              type="button"
              disabled={pending || dirty || unfinished.length > 0}
              title={dirty ? "Save your changes first" : unfinished.length ? "Finish every part first" : undefined}
              onClick={() => {
                if (!window.confirm("Publish now? It goes live on the site straight away, without review.")) return;
                startTransition(
                  async () =>
                    void after(
                      await actions.publishNow(localization.id, lockVersion),
                      "Published. It's live on the site."
                    )
                );
              }}
              className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              Publish now
            </button>
          ) : null}
          {status === "DRAFT" && canWrite(role) ? (
            <button
              type="button"
              disabled={pending || dirty || unfinished.length > 0}
              title={dirty ? "Save your changes first" : unfinished.length ? "Finish every part first" : undefined}
              onClick={() =>
                startTransition(
                  async () =>
                    void after(await actions.submitForReview(localization.id, lockVersion), "Sent for review.")
                )
              }
              className={
                canPublishNow(role)
                  ? "rounded-full border border-line px-4 py-2 hover:border-accent disabled:opacity-50"
                  : "rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
              }
            >
              Submit for review
            </button>
          ) : null}
          {status === "IN_REVIEW" && canReview(role) ? (
            <>
              <button
                type="button"
                disabled={pending || unfinished.length > 0}
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
            {dirty && editable ? (
              <p className="text-sm text-muted">You have unsaved changes. Save before publishing.</p>
            ) : null}
          </div>
        </div>

        <nav aria-label="Lesson parts" className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3">
          {SECTION_IDS.map((id, i) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => sections.open(id)}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-paper"
            >
              <span
                aria-hidden="true"
                className={`grid size-6 place-items-center rounded-lg text-xs font-semibold text-on-pastel ${TINTS[i]}`}
              >
                {i + 1}
              </span>
              <span className="flex-1">{TITLES[i]}</span>
              <StateChip state={parts[id].state} />
            </a>
          ))}
        </nav>

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
