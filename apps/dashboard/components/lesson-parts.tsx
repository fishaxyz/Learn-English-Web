"use client";

import type { CefrLevel, SenseCardFragment } from "@english/graphql";
import type { JSONContent } from "@tiptap/core";
import { useId, useState, type ReactNode } from "react";
import { searchSenses } from "../app/(editor)/lessons/[id]/actions";
import type { EditorSet } from "../lib/exercises";
import { ListFileError, readListFile } from "../lib/list-file";
import { parseScriptFile, scriptDocument } from "../lib/script-file";
import { useCollapsed, type SectionState } from "./editor-section";
import { RichTextEditor } from "./rich-text-editor";

/*
 * The parts of the lesson editor shared by the New lesson page and the lesson page: the four sections' states,
 * the Script fields, the vocabulary list, the section toolbar and the side list. Both pages render the same
 * sections from these, so they look and behave the same.
 */

export const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const SECTION_IDS = ["script", "voice", "vocabulary", "questions"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
/** Every section that folds, the optional ones too (Translation isn't needed to publish). */
const FOLDING_IDS = [...SECTION_IDS, "translation"] as const;
export const TITLES = ["Script", "Voice-over", "Lexical vocabulary", "Questions & quizzes"];
export const smallButton = "rounded-full border border-line px-3 py-1 hover:border-ink";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Each part's one-line summary and state, for its header and the side list. */
export function sectionStates(p: {
  words: number;
  level: string;
  textDirty: boolean;
  tracks: { status: string; stale: boolean }[];
  vocabulary: SenseCardFragment[];
  keys: Set<string>;
  sets: EditorSet[];
  exercisesDirty: boolean;
  /** Vocabulary suggestions still to approve or remove. */
  toCheck?: number;
  /** The worker is looking for vocabulary suggestions right now. */
  findingWords?: boolean;
  /** Drafted questions still to approve or remove. */
  questionsToCheck?: number;
  /** The worker is drafting questions right now. */
  findingQuestions?: boolean;
  /** The lesson's own lexical vocabulary (ADRs 0010, 0011). */
  lexical?: { approved: number; toCheck: number };
  /** New lessons: what will be made when the lesson is created ("Podcast · Lauren & Roger"). */
  voicePlan?: string | null;
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
        : (p.voicePlan ?? "No voice-overs yet"),
      state: needsLook
        ? "attention"
        : making
          ? "busy"
          : approved
            ? "done"
            : p.tracks.length || p.voicePlan
              ? "working"
              : "todo",
    },
    vocabulary:
      p.lexical && (p.lexical.approved || p.lexical.toCheck)
        ? {
            summary: [
              `${plural(p.lexical.approved, "item")} approved`,
              p.lexical.toCheck ? `${p.lexical.toCheck} to check` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            state: p.lexical.approved ? "done" : "working",
          }
        : {
            summary: p.findingWords
              ? "Finding words, phrases and idioms…"
              : p.vocabulary.length
                ? `${plural(p.vocabulary.length, "item")} linked · ${p.keys.size} key${p.toCheck ? ` · ${p.toCheck} suggested to check` : ""}`
                : p.toCheck
                  ? `${p.toCheck} suggested to check`
                  : "No words linked yet",
            state: p.findingWords
              ? "busy"
              : p.textDirty && p.vocabulary.length
                ? "unsaved"
                : p.vocabulary.length
                  ? "done"
                  : "todo",
          },
    questions: {
      summary: p.findingQuestions
        ? "Writing IELTS-style questions…"
        : (p.sets.length ? `${plural(p.sets.length, "set")} · ${plural(questions, "question")}` : "No questions yet") +
          (p.questionsToCheck ? ` · ${p.questionsToCheck} suggested to check` : ""),
      state: p.findingQuestions ? "busy" : p.exercisesDirty ? "unsaved" : questions ? "done" : "todo",
    },
  };
}

export const countWords = (doc: JSONContent | undefined) => (plainText(doc).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

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
export function VocabularyList({ vocabulary, keys }: { vocabulary: SenseCardFragment[]; keys: Set<string> }) {
  const sorted = [...vocabulary].sort((a, b) => Number(keys.has(b.revisionId)) - Number(keys.has(a.revisionId)));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        In the script, select a word or phrase and choose <strong className="text-ink">Link word</strong>; choose{" "}
        <strong className="text-ink">Mark as key word</strong> for the ones learners should see first. Save the script
        to keep the links.
      </p>
      {sorted.length ? (
        <ul aria-label="Linked words" className="grid gap-2 sm:grid-cols-2">
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
    </div>
  );
}

/** Sense revision ids marked as key words in a document. */
export function keyIds(doc: JSONContent | undefined): Set<string> {
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
export function linkedIds(doc: JSONContent | undefined): string[] {
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

export const field =
  "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";

export type ScriptValues = { title: string; summary: string; level: CefrLevel | ""; topicSlugs: string[] };

/**
 * Section 1: title, (web address, for new lessons), summary, level, topics and the text editor. `footer` holds the
 * page's own button (Save script) or notes.
 */
export function ScriptFields({
  values,
  onChange,
  topics,
  editable,
  site,
  initialBody,
  onBody,
  onSenseChosen,
  addressField,
  footer,
}: {
  values: ScriptValues;
  onChange: (values: ScriptValues) => void;
  topics: { slug: string; name: string }[];
  editable: boolean;
  site: { id: string; domain: string };
  initialBody: unknown;
  onBody: (doc: JSONContent) => void;
  onSenseChosen: (sense: SenseCardFragment) => void;
  /** New lessons only: the web address, right under the title. */
  addressField?: ReactNode;
  footer?: ReactNode;
}) {
  const set = (changes: Partial<ScriptValues>) => onChange({ ...values, ...changes });
  // A script file replaces the text: the editor starts again with it.
  const [body, setBody] = useState<{ doc: unknown; version: number }>({ doc: initialBody, version: 0 });
  const [fileMessage, setFileMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const fileId = useId();

  async function pickScript(file: File | undefined) {
    if (!file) return;
    try {
      const read = parseScriptFile(await readListFile(file));
      if (!read.paragraphs.length) return setFileMessage({ tone: "bad", text: `“${file.name}” has no paragraphs.` });
      if (!window.confirm(`Replace the lesson text with the ${read.paragraphs.length} paragraphs of “${file.name}”?`)) {
        return;
      }
      const doc = scriptDocument(read.paragraphs);
      setBody((now) => ({ doc, version: now.version + 1 }));
      onBody(doc);
      // Title and summary from the file only fill empty fields: what's written stays.
      const filled = {
        ...(read.title && !values.title.trim() ? { title: read.title } : {}),
        ...(read.summary && !values.summary.trim() ? { summary: read.summary } : {}),
      };
      if (Object.keys(filled).length) set(filled);
      setFileMessage({
        tone: "good",
        text: `Read ${read.paragraphs.length} paragraphs from “${file.name}”${
          filled.title || filled.summary
            ? ` (and the ${[filled.title && "title", filled.summary && "summary"].filter(Boolean).join(" and ")})`
            : ""
        }. Check the text, then save it.`,
      });
    } catch (error) {
      setFileMessage({
        tone: "bad",
        text: error instanceof ListFileError ? error.message : "That file couldn't be read.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="title" className="flex flex-col gap-1.5 font-medium">
        Title
        <input
          id="title"
          required
          className={field}
          value={values.title}
          disabled={!editable}
          maxLength={200}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      {addressField}
      <label htmlFor="summary" className="flex flex-col gap-1.5 font-medium">
        Summary{" "}
        <span className="text-sm font-normal text-muted">One or two sentences, shown in lists and search results.</span>
        <textarea
          id="summary"
          className={field}
          rows={2}
          value={values.summary}
          disabled={!editable}
          maxLength={1000}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-end gap-6">
        <label htmlFor="level" className="flex flex-col gap-1.5 font-medium">
          Level
          <select
            id="level"
            className={field}
            value={values.level}
            disabled={!editable}
            onChange={(e) => set({ level: e.target.value as CefrLevel | "" })}
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
                checked={values.topicSlugs.includes(t.slug)}
                onChange={(e) =>
                  set({
                    topicSlugs: e.target.checked
                      ? [...values.topicSlugs, t.slug]
                      : values.topicSlugs.filter((x) => x !== t.slug),
                  })
                }
              />
              {t.name}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-muted">For a podcast, start each line with HOST1: or HOST2:.</p>
        {editable ? (
          <>
            <label
              htmlFor={fileId}
              className="ml-auto cursor-pointer rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-accent"
            >
              Choose a script file (.txt or .docx)
            </label>
            <input
              id={fileId}
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                void pickScript(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>
      {fileMessage ? (
        <p role="status" className={`text-sm ${fileMessage.tone === "bad" ? "text-bad" : "text-good"}`}>
          {fileMessage.text}
        </p>
      ) : null}
      <RichTextEditor
        key={body.version}
        initial={body.doc}
        editable={editable}
        onChange={onBody}
        searchSenses={(q) => searchSenses(site.domain, q)}
        onSenseChosen={onSenseChosen}
        newWordHref={(headword) => `/words/new?${new URLSearchParams({ site: site.id, headword })}`}
      />
      {footer}
    </div>
  );
}

/** "Four parts" with Collapse all / Expand all, above the sections. */
export function SectionsToolbar() {
  const sections = useCollapsed();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted">Open the part you&apos;re working on. The voice-over is on the right.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => sections.setAll(FOLDING_IDS, false)} className={smallButton}>
          Collapse all
        </button>
        <button type="button" onClick={() => sections.setAll(FOLDING_IDS, true)} className={smallButton}>
          Expand all
        </button>
      </div>
    </div>
  );
}

/** The two-column frame both pages share: script, vocabulary and questions on the left; the page's card and the
 * voice-over on the right. */
export function LessonFrame({ sections, side }: { sections: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <SectionsToolbar />
        {sections}
      </div>
      <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
        {side}
      </aside>
    </div>
  );
}
