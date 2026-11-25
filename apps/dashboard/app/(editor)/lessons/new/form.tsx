"use client";

import type { SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EditorSection } from "../../../../components/editor-section";
import Link from "next/link";
import { HeadphonesIcon, PlusIcon } from "../../../../components/icons";
import { ExercisesEditor } from "../../../../components/exercises-editor";
import {
  countWords,
  field,
  keyIds,
  LessonFrame,
  linkedIds,
  ScriptFields,
  sectionStates,
  VocabularyList,
  type ScriptValues,
} from "../../../../components/lesson-parts";
import { confirmCost, type Catalog } from "../../../../components/voice-picker";
import { costOf, initialChoice, problemOf, resolved, VoiceSettings } from "../../../../components/voice-settings";
import { toPayload, type EditorSet } from "../../../../lib/exercises";
import { voiceText } from "../../../../lib/voice-text";
import { createLesson, slugStatus } from "./actions";

/** "My First Lesson!" → "my-first-lesson". Editors can still change it before creating. */
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** On a new lesson the Suggest buttons wait: suggestions are made from the saved script. */
function SuggestCard({ what, label }: { what: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sun/25 p-4 text-sm">
      <p className="min-w-60 flex-1 text-muted">{what}</p>
      <button
        type="button"
        disabled
        className="rounded-full bg-accent px-4 py-1.5 font-semibold text-on-accent disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

/**
 * A new reading, in the same four sections as the lesson page (the same components): script, voice-over,
 * vocabulary and questions. Creating saves the draft with everything filled in here, then starts the voice-overs.
 */
export function NewLessonForm({
  site,
  siteName,
  topics,
}: {
  site: { id: string; domain: string };
  siteName: string;
  topics: { slug: string; name: string }[];
}) {
  const [script, setScript] = useState<ScriptValues>({ title: "", summary: "", level: "", topicSlugs: [] });
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [body, setBody] = useState<JSONContent | null>(null);
  const [words, setWords] = useState(0);
  const [linked, setLinked] = useState<string[]>([]);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [senses, setSenses] = useState<Record<string, SenseCardFragment>>({});
  const [sets, setSets] = useState<EditorSet[]>([]);
  const [choice, setChoice] = useState(initialChoice);
  const [make, setMake] = useState(true);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whether the web address is free, checked while typing (and fixed by itself when it came from the title).
  const [slugCheck, setSlugCheck] = useState<{ slug: string; taken: boolean; suggestion: string | null } | null>(null);
  useEffect(() => {
    if (!SLUG.test(slug)) return;
    let live = true;
    const timer = setTimeout(() => {
      void slugStatus(site.id, slug).then((r) => {
        if (!live) return;
        if (r.taken && r.suggestion && !slugEdited) setSlug(r.suggestion);
        else setSlugCheck({ slug, ...r });
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug, slugEdited, site.id]);
  const slugTaken = slugCheck?.slug === slug && slugCheck.taken;
  const [pending, start] = useTransition();

  const text = voiceText(body);
  const sent = resolved(choice, catalog);
  const cost = costOf(sent, text);
  // Nothing to voice is fine (a single voice with none chosen just makes no voice-over).
  const wantsVoice = make && (sent.mode === "conversation" || sent.voices.length > 0);
  const voiceProblem = wantsVoice ? problemOf(sent, text) : null;
  const vocabulary = useMemo(
    () => linked.map((id) => senses[id]).filter((s): s is SenseCardFragment => Boolean(s)),
    [linked, senses]
  );
  const voiceName = (id: string) => catalog?.voices.find((v) => v.id === id)?.name.split(" - ")[0] ?? "";
  const voicePlan = !wantsVoice
    ? null
    : sent.mode === "conversation"
      ? `Podcast · ${voiceName(sent.host1.voiceId)} & ${voiceName(sent.host2.voiceId)} · made when you create it`
      : `${sent.voices.length} voice(s) · made when you create it`;
  const parts = sectionStates({
    words,
    level: script.level,
    textDirty: false,
    tracks: [],
    vocabulary,
    keys,
    sets,
    exercisesDirty: false,
    voicePlan,
  });
  const exercises = toPayload(sets);
  const problem = !script.title.trim()
    ? "Give the lesson a title."
    : !SLUG.test(slug)
      ? "Give it a web address: lowercase words joined by hyphens."
      : slugTaken
        ? "That web address is already used by another lesson: choose another."
        : typeof exercises === "string"
          ? exercises
          : voiceProblem;

  /** Saves the lesson, then opens its preview ("Save and Preview") or its page to keep editing ("Save script"). */
  function create(open: "preview" | "edit" = "preview") {
    if (problem || typeof exercises === "string") return;
    if (
      wantsVoice &&
      !confirmCost(catalog, cost.count > 1 ? `${cost.count} voice-overs` : cost.what, cost.characters)
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await createLesson({
        siteId: site.id,
        slug,
        ...script,
        // Plain JSON: Tiptap's attribute objects aren't plain, and React can't send them to a server action as-is.
        body: body ? (JSON.parse(JSON.stringify(body)) as unknown) : null,
        exercises,
        voice: { ...sent, make },
        open,
        autoSlug: !slugEdited,
      });
      setError(r.message); // only returned when creating failed; success opens the lesson
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href={`/lessons?site=${site.id}`} className="text-sm text-accent hover:underline">
            ← Reading Library
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-medium tracking-tight">New reading</h1>
            <span className="rounded-full bg-line/70 px-2.5 py-0.5 text-xs font-semibold">Not saved</span>
          </div>
          <p className="text-sm text-muted">{siteName}</p>
        </div>
        <div className="flex max-w-xs flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => create()}
            disabled={pending || !!problem}
            title={problem ?? undefined}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
          >
            <PlusIcon /> {pending ? "Saving…" : "Save and Preview"}
          </button>
          {problem ? <p className="text-right text-sm text-muted">{problem}</p> : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}
        </div>
      </div>
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
                  if (!slugEdited) setSlug(slugify(next.title));
                }}
                topics={topics}
                editable
                site={site}
                initialBody={null}
                onBody={(doc) => {
                  setBody(doc);
                  setWords(countWords(doc));
                  setLinked(linkedIds(doc));
                  setKeys(keyIds(doc));
                }}
                onSenseChosen={(sense) => setSenses((prev) => ({ ...prev, [sense.revisionId]: sense }))}
                addressField={
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="slug" className="font-medium">
                      Web address
                    </label>
                    <div className="flex items-center gap-1 text-sm text-muted">
                      <span>/reading/</span>
                      <input
                        id="slug"
                        required
                        maxLength={120}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        value={slug}
                        aria-describedby="slug-help"
                        className={`${field} flex-1 font-mono text-ink`}
                        onChange={(e) => {
                          setSlug(e.target.value);
                          setSlugEdited(true);
                        }}
                      />
                    </div>
                    {slugTaken ? (
                      <p id="slug-help" role="alert" className="flex flex-wrap items-center gap-2 text-sm text-bad">
                        This web address is already used by another lesson.
                        {slugCheck?.suggestion ? (
                          <button
                            type="button"
                            onClick={() => setSlug(slugCheck.suggestion ?? slug)}
                            className="rounded-full border border-bad px-3 py-0.5 font-medium hover:bg-bad-soft"
                          >
                            Use {slugCheck.suggestion}
                          </button>
                        ) : null}
                      </p>
                    ) : (
                      <p id="slug-help" className="text-sm text-muted">
                        Lowercase words joined by hyphens. It can&apos;t be changed after publishing.
                      </p>
                    )}
                  </div>
                }
                footer={
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => create("edit")}
                      disabled={pending || !!problem}
                      title={problem ?? undefined}
                      className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
                    >
                      {pending ? "Saving…" : "Save script"}
                    </button>
                    <p className={`text-sm ${error ? "text-bad" : "text-muted"}`} role={error ? "alert" : undefined}>
                      {error ?? problem ?? (text.single ? `${text.single.toLocaleString("en")} characters.` : "")}
                    </p>
                  </div>
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
              <div className="flex flex-col gap-4">
                <SuggestCard
                  label="Suggest vocabulary"
                  what="Save the script first (the Save script button at the end of the Script): then the local AI can find words, phrases and idioms worth learning in it."
                />
                <VocabularyList vocabulary={vocabulary} keys={keys} />
              </div>
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
                <SuggestCard
                  label="Suggest questions"
                  what="Save the script first (the Save script button at the end of the Script): then the local AI can draft IELTS-style questions about it."
                />
                <ExercisesEditor sets={sets} disabled={false} onChange={setSets} />
              </div>
            </EditorSection>
          </>
        }
        side={
          <>
            <EditorSection
              id="voice"
              step={<HeadphonesIcon />}
              title="Voice-over"
              summary={parts.voice.summary}
              state={parts.voice.state}
              tint="bg-sky"
            >
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={make} onChange={(e) => setMake(e.target.checked)} />
                  Make it now
                </label>
                <div className={make ? "" : "opacity-60"}>
                  <VoiceSettings
                    siteId={site.id}
                    text={text}
                    value={choice}
                    onChange={setChoice}
                    onCatalog={setCatalog}
                  />
                </div>
                <p className="text-sm text-muted">
                  {make
                    ? "Made right after the lesson is created. Listen to each one and approve it before publishing."
                    : "No voice-over now; you can make one on the lesson page."}
                </p>
              </div>
            </EditorSection>
          </>
        }
      />
    </div>
  );
}
