"use client";

import type { VocabularyItemViewFragment } from "@english/graphql";
import { RichTextRenderer, type BlockExtras, type SpeakerNames } from "@english/ui";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { EXAMPLE_TRANSLATIONS } from "../lib/example-translations";
import { DISPLAY_LABEL, TRANSLATION_LANGUAGES, useReadingPrefs, type DisplayMode } from "../lib/reading-prefs";
import { blockById, blockText, pointInText, rangeForSpan, sentenceAt, sentencesOf } from "../lib/text-spans";
import { ReadingSettingsControls, Switch } from "./reading-settings";
import { AudioPlayer, type PlayerHandle, type Track } from "./audio-player";

const SENTENCE_HIGHLIGHT = "sentence-hover";
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlightRegistry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;
import { useMyWords, type SavedItem } from "../lib/my-words";
import { isStructure, languageName, WordCard } from "./word-card";

type Item = VocabularyItemViewFragment;
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

/** The word under a click, for words that aren't prepared (to say so kindly). */
function wordAt(x: number, y: number): string | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) [node, offset] = [pos.offsetNode, pos.offset];
  else {
    const range = document.caretRangeFromPoint?.(x, y);
    if (range) [node, offset] = [range.startContainer, range.startOffset];
  }
  const text = node?.nodeType === Node.TEXT_NODE ? (node.textContent ?? "") : "";
  if (!text) return null;
  const isLetter = (c: string | undefined) => !!c && /[\p{L}'’-]/u.test(c);
  let start = offset;
  let end = offset;
  while (start > 0 && isLetter(text[start - 1])) start -= 1;
  while (end < text.length && isLetter(text[end])) end += 1;
  const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, "");
  return word.length > 1 ? word : null;
}

function Popover({
  anchor,
  onClose,
  label,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Below the word if it fits, otherwise above it; always inside the window, and re-placed when the card's
  // size changes (a translation loads, the list button changes) or the page scrolls.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 16);
      const height = panel.current?.offsetHeight ?? 320;
      const below = r.bottom + 8;
      const fitsBelow = below + height <= window.innerHeight - 8;
      const top = fitsBelow ? below : Math.max(8, r.top - height - 8);
      setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      // First render is invisible, so the card can be measured before it's placed.
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      className="fixed z-50 max-h-[calc(100vh-1rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-5 font-sans text-base shadow-xl"
    >
      {children}
    </div>,
    document.body
  );
}

/**
 * The reading page's tabs: the article itself, its questions, and its vocabulary. Every panel stays mounted, so
 * the voice-over keeps playing and answers are kept while the learner switches.
 *
 * The reading, the learner's way (AGENTS.md §7: an interactive island in a server-rendered page):
 * read the clean text and tap prepared words or structures (a structure is always added whole); words already in
 * their list are underlined, and every item opens its card.
 */
export function ReadingExperience({
  body,
  items,
  lesson,
  tracks = [],
  speakers,
  questions,
  questionCount = 0,
  translations = {},
  previewTranslations = false,
}: {
  body: unknown;
  items: Item[];
  lesson: { slug: string; title: string };
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
  const words = useMyWords();
  const [open, setOpen] = useState<{ item: Item; anchor: HTMLElement } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const byRevision = new Map(items.map((i) => [i.sense.revisionId, i]));
  const languages = [...new Set(items.flatMap((i) => i.sense.translations.map((t) => t.locale)))].sort();

  function toggle(item: Item) {
    const id = item.sense.revisionId;
    if (words.has(id)) {
      words.remove(id);
      return;
    }
    const first = item.occurrences[0];
    const saved: SavedItem = {
      senseRevisionId: id,
      displayForm: item.sense.entry.displayForm,
      kind: item.sense.entry.kind,
      partOfSpeech: item.sense.partOfSpeech,
      definition: item.sense.definition,
      translations: item.sense.translations.map((t) => ({ locale: t.locale, text: t.text })),
      sentence: first?.sentence ?? "",
      surface: first?.text ?? item.sense.entry.displayForm,
      lesson,
      addedAt: new Date().toISOString(),
    };
    words.add(saved);
  }

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
    if ((e.target as HTMLElement).closest("button")) return; // a prepared word: its card opens
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
        return;
      }
    }
    // Tapping a word nobody prepared yet: say so, without interrupting the reading.
    const word = wordAt(e.clientX, e.clientY);
    setNotice(word ? `“${word}” isn’t in our word list yet. Highlighted words and phrases can be added.` : null);
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
    { id: "vocabulary", label: "Vocabulary", count: items.length },
  ];

  function choose(next: Tab) {
    setTab(next);
    setOpen(null);
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
        <Link href="/my-words" className="ml-auto text-sm font-medium text-accent hover:underline">
          My words ({words.items.length})
        </Link>
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

        <p className="font-sans text-sm text-muted">
          {`Read the text. Tap a word or phrase you want to learn, then add it to your list.${
            canHearSentences ? " Tap any sentence to hear it." : ""
          }`}
        </p>

        <div
          ref={text}
          onClick={onTextClick}
          onPointerMove={(e) => {
            if (canHearSentences && e.pointerType === "mouse") showHover(sentenceUnder(e.clientX, e.clientY));
          }}
          onPointerLeave={() => showHover(null)}
          className={`lesson-text font-reading text-[1.1875rem] leading-[1.75] text-ink ${canHearSentences ? "cursor-pointer" : ""}`}
        >
          <RichTextRenderer
            doc={body}
            speakers={speakers}
            extras={extras}
            renderTerm={(senseRevisionId, children, key) => {
              const item = byRevision.get(senseRevisionId);
              if (!item) return children;
              const chosen = words.has(senseRevisionId);
              const style = chosen ? "underline decoration-accent/60 decoration-1 underline-offset-4" : "";
              return (
                <button
                  key={key}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    setNotice(null);
                    setOpen({ item, anchor: e.currentTarget });
                  }}
                  className={`cursor-pointer text-inherit hover:bg-accent-soft/60 focus-visible:outline-2 focus-visible:outline-accent ${style}`}
                >
                  {children}
                  {chosen ? <span className="sr-only"> (in your list)</span> : null}
                </button>
              );
            }}
          />
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
        {items.length ? (
          <WordPanel
            items={items}
            language={words.language}
            languages={languages}
            setLanguage={words.setLanguage}
            has={words.has}
            toggle={toggle}
          />
        ) : (
          <p className="text-muted">There is no vocabulary for this lesson yet.</p>
        )}
      </div>

      {open ? (
        <Popover
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          label={`About “${open.item.sense.entry.displayForm}”`}
        >
          <WordCard
            item={open.item}
            language={words.language}
            inList={words.has(open.item.sense.revisionId)}
            onToggle={() => toggle(open.item)}
            playInText={
              tracks.length && open.item.occurrences[0]
                ? () => {
                    const o = open.item.occurrences[0];
                    return !!o && !!player.current?.playSpan(o.blockId, o.start, o.end);
                  }
                : undefined
            }
          />
        </Popover>
      ) : null}
    </div>
  );
}

/** "Words in this text": key words first, then other words, then structures. Another way to add. */
function WordPanel({
  items,
  language,
  languages,
  setLanguage,
  has,
  toggle,
}: {
  items: Item[];
  language: string | null;
  languages: string[];
  setLanguage: (l: string | null) => void;
  has: (id: string) => boolean;
  toggle: (item: Item) => void;
}) {
  if (!items.length) return null;
  const groups: [string, Item[]][] = [
    ["Key words", items.filter((i) => i.isKey && !isStructure(i.sense.entry.kind))],
    ["More words", items.filter((i) => !i.isKey && !isStructure(i.sense.entry.kind))],
    ["Phrases and structures", items.filter((i) => isStructure(i.sense.entry.kind))],
  ];
  return (
    <section
      aria-labelledby="words-heading"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 font-sans"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="words-heading" className="font-display text-2xl font-semibold">
          Words in this text
        </h2>
        {languages.length ? (
          <label className="flex items-center gap-2 text-sm">
            Translations in
            <select
              value={language ?? ""}
              onChange={(e) => setLanguage(e.target.value || null)}
              className="rounded-md border border-line bg-surface px-2 py-1"
            >
              <option value="">No translation</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {groups.map(([title, list]) =>
        list.length ? (
          <div key={title} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              {title}
              {title === "Key words" ? (
                <span className="ml-2 normal-case tracking-normal text-accent">Suggested</span>
              ) : null}
            </h3>
            <ul className="flex flex-col divide-y divide-line">
              {list.map((item) => {
                const chosen = has(item.sense.revisionId);
                const translation = language ? item.sense.translations.find((t) => t.locale === language) : undefined;
                return (
                  <li key={item.sense.revisionId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.sense.entry.displayForm}
                        {translation ? (
                          <span lang={translation.locale} className="ml-2 font-normal text-accent">
                            {translation.text}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-muted">{item.sense.definition}</p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      aria-label={`${chosen ? "Remove" : "Add"} “${item.sense.entry.displayForm}” ${chosen ? "from" : "to"} my list`}
                      onClick={() => toggle(item)}
                      className={
                        chosen
                          ? "shrink-0 rounded-full border border-accent px-3 py-1 text-sm font-semibold text-accent"
                          : "shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent hover:bg-accent-strong"
                      }
                    >
                      {chosen ? "✓ Added" : "＋ Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null
      )}
    </section>
  );
}
