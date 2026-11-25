"use client";

import type { SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import { useMemo, useState, useTransition } from "react";
import { EditorSection, useCollapsed } from "../../../../components/editor-section";
import { ExercisesEditor } from "../../../../components/exercises-editor";
import {
  countWords,
  field,
  keyIds,
  LessonFrame,
  linkedIds,
  PartsNav,
  ScriptFields,
  sectionStates,
  VocabularyList,
  type ScriptValues,
} from "../../../../components/lesson-parts";
import { confirmCost, type Catalog } from "../../../../components/voice-picker";
import { costOf, initialChoice, problemOf, resolved, VoiceSettings } from "../../../../components/voice-settings";
import { toPayload, type EditorSet } from "../../../../lib/exercises";
import { voiceText } from "../../../../lib/voice-text";
import { createLesson } from "./actions";

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

/**
 * A new reading, in the same four sections as the lesson page (the same components): script, voice-over,
 * vocabulary and questions. Creating saves the draft with everything filled in here, then starts the voice-overs.
 */
export function NewLessonForm({
  site,
  topics,
}: {
  site: { id: string; domain: string };
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
  const [pending, start] = useTransition();
  const sections = useCollapsed();

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
      : typeof exercises === "string"
        ? exercises
        : voiceProblem;
  const button = !wantsVoice
    ? "Create draft"
    : sent.mode === "conversation"
      ? "Create draft and make the podcast"
      : "Create draft and make voice-overs";

  function create() {
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
      });
      setError(r.message); // only returned when creating failed; success opens the lesson
    });
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
                  <p id="slug-help" className="text-sm text-muted">
                    Lowercase words joined by hyphens. It can&apos;t be changed after publishing.
                  </p>
                </div>
              }
              footer={
                <p className="text-sm text-muted">
                  {text.single ? `${text.single.toLocaleString("en")} characters.` : ""}
                </p>
              }
            />
          </EditorSection>

          <EditorSection
            id="voice"
            step={2}
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
              siteId={site.id}
              editable
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
            <ExercisesEditor sets={sets} disabled={false} onChange={setSets} />
          </EditorSection>
        </>
      }
      side={
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">New reading · not saved yet</p>
            <p className="text-sm">
              Fill in what you have: everything can be finished on the lesson page later. It goes out only when all four
              parts are done.
            </p>
            {problem ? <p className="text-sm text-bad">{problem}</p> : null}
            {error ? (
              <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={create}
              disabled={pending || !!problem}
              className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              {pending ? "Creating…" : button}
            </button>
          </div>
          <PartsNav parts={parts} />
        </>
      }
    />
  );
}
