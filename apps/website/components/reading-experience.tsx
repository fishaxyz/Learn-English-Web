"use client";

import { RichTextRenderer, type BlockExtras, type SpeakerNames } from "@english/ui";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { EXAMPLE_TRANSLATIONS } from "../lib/example-translations";
import { languageName } from "../lib/languages";
import { DISPLAY_LABEL, TRANSLATION_LANGUAGES, useReadingPrefs, type DisplayMode } from "../lib/reading-prefs";
import { blockById, blockText, pointInText, rangeForSpan, sentenceAt, sentencesOf } from "../lib/text-spans";
import { ReadingSettingsControls, Switch } from "./reading-settings";
import { AudioPlayer, type PlayerHandle, type Track } from "./audio-player";
import { LexicalPanel, type LexicalItem } from "./lexical-panel";

const SENTENCE_HIGHLIGHT = "sentence-hover";
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlightRegistry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;

type Tab = "article" | "questions" | "vocabulary";

/** Sentence translations by language, then by `${blockId}:${start}` of the sentence. */
export type Translations = Record<string, Record<string, string>>;

const shortLanguage = (locale: string) => (locale.split("-")[0] ?? locale).toUpperCase();

/** For reviewing the layout before lessons have translations: an example translation, or a marked stand-in. */
function example(language: string, text: string, span: { start: number; end: number }) {
  const sentence = [...text].slice(span.start, span.end).join("").replace(/\s+/g, " ");
  return EXAMPLE_TRANSLATIONS[sentence]?.[language] ?? placeholder(language, sentence);
}

function placeholder(language: string, sentence: string) {
  const words = sentence.split(/\s+/);
  const start = words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");
  return `[${languageName(language)} translation of “${start}”]`;
}

function TranslationToolbar({ available, preview }: { available: boolean; preview: boolean }) {
  const [prefs, update] = useReadingPrefs();
  const select = "cursor-pointer rounded-lg bg-transparent py-1 pl-1 font-medium text-accent hover:bg-accent-soft";
  return (
    <div className="flex flex-col gap-2 font-sans">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2 text-sm">
        <span className="font-semibold text-accent">EN ↔ {shortLanguage(prefs.language)}</span>
        <label className="flex items-center">
          <span className="sr-only">Translation language</span>
          <select value={prefs.language} onChange={(e) => update({ language: e.target.value })} className={select}>
            {TRANSLATION_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center">
          <span className="sr-only">Display mode</span>
          <select
            value={prefs.display}
            onChange={(e) => update({ display: e.target.value as DisplayMode, translate: true })}
            className={select}
          >
            {(Object.keys(DISPLAY_LABEL) as DisplayMode[]).map((d) => (
              <option key={d} value={d}>
                {DISPLAY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto">
          <Switch label="Translation" on={prefs.translate} onChange={(translate) => update({ translate })} />
        </span>
      </div>
      {prefs.translate && preview ? (
        <p className="text-sm text-muted">
          Preview: example translations. Sentences without an example show a stand-in in brackets.
        </p>
      ) : prefs.translate && !available ? (
        <p className="text-sm text-muted">There’s no {languageName(prefs.language)} translation for this lesson yet.</p>
      ) : prefs.translate && prefs.display === "on-demand" ? (
        <p className="text-sm text-muted">Tap a sentence to see its translation.</p>
      ) : null}
    </div>
  );
}

/**
 * The reading page's tabs: the article itself, its questions, and its lexical vocabulary. Every panel stays
 * mounted, so the voice-over keeps playing and answers are kept while the learner switches.
 *
 * The article is clean text (AGENTS.md §7: an interactive island in a server-rendered page): a tap on a sentence
 * plays it; the lesson's keywords, idioms and structures are studied in the Lexical Vocabulary tab (ADR 0010).
 */
export function ReadingExperience({
  body,
  lexicalItems,
  tracks = [],
  speakers,
  questions,
  questionCount = 0,
  translations = {},
  previewTranslations = false,
}: {
  body: unknown;
  lexicalItems: LexicalItem[];
  tracks?: Track[];
  /** For conversations: the names shown instead of HOST1/HOST2. */
  speakers?: SpeakerNames;
  /** The exercises, rendered by the page (they grade on the server). */
  questions?: ReactNode;
  questionCount?: number;
  /** Approved sentence translations, by language and sentence place (`blockId:start`). */
  translations?: Translations;
  /** Shows marked stand-ins where translations will go, to review the layout. */
  previewTranslations?: boolean;
}) {
  const [prefs] = useReadingPrefs();
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const top = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("article");
  const text = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerHandle>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // With a voice-over, a sentence can be heard on its own: hover colours it, a click plays it.
  const canHearSentences = tracks.some((t) => t.wordTimings.length > 0);
  const hovered = useRef<string | null>(null);

  function sentenceUnder(x: number, y: number) {
    const container = text.current;
    const at = container ? pointInText(container, x, y) : null;
    const block = container && at ? blockById(container, at.blockId) : null;
    const span = block && at ? sentenceAt(blockText(block), at.offset) : null;
    return at && span ? { blockId: at.blockId, ...span } : null;
  }

  function showHover(sentence: { blockId: string; start: number; end: number } | null) {
    const key = sentence ? `${sentence.blockId}:${sentence.start}` : null;
    if (key === hovered.current) return;
    hovered.current = key;
    const registry = highlightRegistry();
    const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const range =
      sentence && text.current ? rangeForSpan(text.current, sentence.blockId, sentence.start, sentence.end) : null;
    if (registry && Highlight && range) registry.set(SENTENCE_HIGHLIGHT, new Highlight(range));
    else registry?.delete(SENTENCE_HIGHLIGHT);
  }
  useEffect(() => () => highlightRegistry()?.delete(SENTENCE_HIGHLIGHT), []);

  function onTextClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (window.getSelection()?.toString()) return; // they're selecting text, not tapping
    if ((e.target as HTMLElement).closest("[data-extra]")) return; // a translation, not the lesson text
    const tapped = sentenceUnder(e.clientX, e.clientY);
    if (tapped && prefs.translate && prefs.display === "on-demand") {
      const key = `${tapped.blockId}:${tapped.start}`;
      setShown((now) => {
        const next = new Set(now);
        if (!next.delete(key)) next.add(key);
        return next;
      });
    }
    if (canHearSentences) {
      const sentence = tapped;
      if (sentence) {
        const played = player.current?.playSpan(sentence.blockId, sentence.start, sentence.end);
        setNotice(played ? null : "This voice can’t play single sentences. Choose another voice above.");
      }
    }
  }

  // Translations, placed by the display mode: after a tapped sentence, after every sentence or paragraph, or beside.
  const byLanguage = translations[prefs.language] ?? {};
  const hasTranslations = Object.keys(byLanguage).length > 0;
  const translationOf = (blockId: string, text: string, span: { start: number; end: number }) =>
    byLanguage[`${blockId}:${span.start}`] ?? (previewTranslations ? example(prefs.language, text, span) : null);
  const paragraphOf = (blockId: string, text: string) =>
    sentencesOf(text)
      .map((span) => translationOf(blockId, text, span))
      .filter(Boolean)
      .join(" ");
  const line = "block border-l-2 border-accent/40 pl-3 font-sans text-base leading-relaxed text-muted";
  const lang = prefs.language;
  const extras: BlockExtras | undefined = !prefs.translate
    ? undefined
    : prefs.display === "sentence" || prefs.display === "on-demand"
      ? {
          insertAfter: (blockId, text) => {
            const out = new Map<number, ReactNode>();
            for (const span of sentencesOf(text)) {
              if (prefs.display === "on-demand" && !shown.has(`${blockId}:${span.start}`)) continue;
              const t = translationOf(blockId, text, span);
              if (t)
                out.set(
                  span.end,
                  <span data-extra="" lang={lang} className={`${line} my-2`}>
                    {t}
                  </span>
                );
            }
            return out;
          },
        }
      : {
          wrap: (blockId, text, block) => {
            const t = paragraphOf(blockId, text);
            if (!t) return block;
            return prefs.display === "side-by-side" ? (
              <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                {block}
                <p data-extra="" lang={lang} className="font-sans text-base leading-relaxed text-muted">
                  {t}
                </p>
              </div>
            ) : (
              <>
                {block}
                <p data-extra="" lang={lang} className={`${line} mt-2`}>
                  {t}
                </p>
              </>
            );
          },
        };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "article", label: "Article" },
    { id: "questions", label: "Questions", count: questionCount },
    { id: "vocabulary", label: "Lexical Vocabulary", count: lexicalItems.length },
  ];

  function choose(next: Tab) {
    setTab(next);
    setNotice(null);
    // When the learner has scrolled down the article, the new tab starts at its top.
    const at = top.current?.getBoundingClientRect().top ?? 0;
    if (at < 0) top.current?.scrollIntoView({ block: "start" });
  }

  function onTabKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(at + step + tabs.length) % tabs.length];
    if (!next) return;
    choose(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-6">
      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-3 border-b border-line bg-paper/95 px-4 py-3 font-sans backdrop-blur">
        <div role="tablist" aria-label="Lesson parts" onKeyDown={onTabKey} className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => choose(t.id)}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-ink hover:border-accent aria-selected:border-ink aria-selected:bg-ink aria-selected:text-paper"
            >
              {t.label}
              {t.count !== undefined ? (
                <span className="rounded-full bg-paper px-1.5 text-xs font-bold text-muted">{t.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {tracks.length ? (
        <AudioPlayer ref={player} tracks={tracks} text={text} settings={<ReadingSettingsControls />} />
      ) : null}

      <div
        id="panel-article"
        role="tabpanel"
        aria-labelledby="tab-article"
        hidden={tab !== "article"}
        className="flex flex-col gap-6"
      >
        <TranslationToolbar available={hasTranslations} preview={previewTranslations} />

        {canHearSentences ? <p className="font-sans text-sm text-muted">Tap any sentence to hear it.</p> : null}

        <div
          ref={text}
          onClick={onTextClick}
          onPointerMove={(e) => {
            if (canHearSentences && e.pointerType === "mouse") showHover(sentenceUnder(e.clientX, e.clientY));
          }}
          onPointerLeave={() => showHover(null)}
          className={`lesson-text font-reading text-[1.1875rem] leading-[1.75] text-ink ${canHearSentences ? "cursor-pointer" : ""}`}
        >
          <RichTextRenderer doc={body} speakers={speakers} extras={extras} />
        </div>
        {notice ? (
          <p role="status" className="rounded-lg bg-surface px-4 py-2 font-sans text-sm text-muted shadow-sm">
            {notice}
          </p>
        ) : null}
      </div>

      <div
        id="panel-questions"
        role="tabpanel"
        aria-labelledby="tab-questions"
        hidden={tab !== "questions"}
        className="flex flex-col gap-6 font-sans"
      >
        {questionCount ? questions : <p className="text-muted">There are no questions for this lesson yet.</p>}
      </div>

      <div
        id="panel-vocabulary"
        role="tabpanel"
        aria-labelledby="tab-vocabulary"
        hidden={tab !== "vocabulary"}
        className="font-sans"
      >
        <LexicalPanel items={lexicalItems} language={prefs.language} />
      </div>
    </div>
  );
}
