"use client";

import type { CefrLevel, EditorialLessonQuery, EditorialSummaryFragment, SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { fromPayload, toPayload, type EditorSet } from "../lib/exercises";
import { voiceText } from "../lib/voice-text";
import { EditorSection, useCollapsed } from "./editor-section";
import { HeadphonesIcon } from "./icons";
import { ExercisesEditor } from "./exercises-editor";
import {
  countWords,
  keyIds,
  LessonFrame,
  linkedIds,
  ScriptFields,
  SECTION_IDS,
  sectionStates,
  TITLES,
  VocabularyList,
  type ScriptValues,
} from "./lesson-parts";
import { VoiceoverPanel } from "./voiceover-panel";

type Lesson = NonNullable<EditorialLessonQuery["editorialResource"]>;
type Localization = Lesson["localizations"][number];
type Role = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

const canWrite = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "EDITOR";
const canReview = (r: Role | undefined) => r === "OWNER" || r === "ADMIN" || r === "REVIEWER";
const canPublishNow = (r: Role | undefined) => r === "OWNER" || r === "ADMIN";

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
  const [script, setScript] = useState<ScriptValues>({
    title: draft?.title ?? "",
    summary: draft?.summary ?? "",
    level: (draft?.cefrLevel ?? "") as CefrLevel | "",
    topicSlugs: draft?.topics.map((t) => t.slug) ?? [],
  });
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
        title: script.title,
        summary: script.summary.trim() || null,
        cefrLevel: script.level || null,
        body: saved,
        topicSlugs: script.topicSlugs,
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
  const parts = sectionStates({
    words,
    level: script.level,
    textDirty,
    tracks,
    vocabulary,
    keys,
    sets,
    exercisesDirty,
  });
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
    <LessonFrame
      sections={
        <>
          <EditorSection
            id="script"
            step={1}
            title="Script"
            summary={parts.script.summary}
            state={parts.script.state}
            tint="bg-pink"
          >
            <ScriptFields
              values={script}
              onChange={(next) => {
                setScript(next);
                setTextDirty(true);
              }}
              topics={topics}
              editable={editable}
              site={lesson.site}
              initialBody={draft.body}
              onBody={(doc) => {
                body.current = doc;
                setWords(countWords(doc));
                setLinked(linkedIds(doc));
                setKeys(keyIds(doc));
                setTextDirty(true);
              }}
              onSenseChosen={(sense) => setSenses((prev) => ({ ...prev, [sense.revisionId]: sense }))}
              footer={
                editable ? (
                  <button
                    type="button"
                    onClick={saveText}
                    disabled={pending || !textDirty}
                    className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
                  >
                    {pending ? "Saving…" : textDirty ? "Save text" : "Text saved"}
                  </button>
                ) : null
              }
            />
          </EditorSection>

          <EditorSection
            id="vocabulary"
            step={2}
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
            step={3}
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
        </>
      }
      side={
        <>
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

          <EditorSection
            id="voice"
            step={<HeadphonesIcon />}
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
        </>
      }
    />
  );
}

export type { EditorialSummaryFragment };
