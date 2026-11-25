"use client";

import type { VocabularyItemViewFragment } from "@english/graphql";
import { RichTextRenderer, type SpeakerNames } from "@english/ui";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { blockById, blockText, pointInText, rangeForSpan, sentenceAt } from "../lib/text-spans";
import { AudioPlayer, type PlayerHandle, type Track } from "./audio-player";

const SENTENCE_HIGHLIGHT = "sentence-hover";
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlightRegistry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;
import { SUGGESTED_PER_READING, useMyWords, type SavedItem } from "../lib/my-words";
import { isStructure, languageName, WordCard } from "./word-card";

type Item = VocabularyItemViewFragment;
type Mode = "choose" | "study";

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
 * The reading, the learner's way (AGENTS.md §7: an interactive island in a server-rendered page):
 * 1. read the clean text and tap prepared words or structures; a structure is always added whole;
 * 2. the counter shows the list for this reading, with a gentle suggestion, never a limit;
 * 3. "Study my words" highlights only what they chose; every item opens its card.
 */
export function ReadingExperience({
  body,
  items,
  lesson,
  tracks = [],
  speakers,
}: {
  body: unknown;
  items: Item[];
  lesson: { slug: string; title: string };
  tracks?: Track[];
  /** For conversations: the names shown instead of HOST1/HOST2. */
  speakers?: SpeakerNames;
}) {
  const text = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerHandle>(null);
  const words = useMyWords();
  const [mode, setMode] = useState<Mode>("choose");
  const [open, setOpen] = useState<{ item: Item; anchor: HTMLElement } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const byRevision = new Map(items.map((i) => [i.sense.revisionId, i]));
  const chosenHere = items.filter((i) => words.has(i.sense.revisionId));
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
    if (canHearSentences) {
      const sentence = sentenceUnder(e.clientX, e.clientY);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-30 -mx-4 flex font-sans flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <p className="text-sm font-medium" aria-live="polite">
          My list for this reading: <span className="font-semibold text-accent">{chosenHere.length}</span>
        </p>
        <div role="group" aria-label="Reading mode" className="flex rounded-full border border-line p-0.5 text-sm">
          {(["choose", "study"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className="rounded-full px-3 py-1 font-medium aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {m === "choose" ? "Read & choose" : "Study my words"}
            </button>
          ))}
        </div>
        <Link href="/my-words" className="ml-auto text-sm font-medium text-accent hover:underline">
          My words ({words.items.length})
        </Link>
        {chosenHere.length > SUGGESTED_PER_READING ? (
          <p className="w-full text-sm text-muted">
            {SUGGESTED_PER_READING} is a good number to start with. You can keep adding; smaller lists are easier to
            remember.
          </p>
        ) : null}
      </div>

      {tracks.length ? <AudioPlayer ref={player} tracks={tracks} text={text} /> : null}

      <p className="font-sans text-sm text-muted">
        {mode === "choose"
          ? `Read the text. Tap a word or phrase you want to learn, then add it to your list.${
              canHearSentences ? " Tap any sentence to hear it." : ""
            }`
          : chosenHere.length
            ? "Your words are highlighted. Tap one to see it again."
            : "You haven’t chosen any words yet. Switch to “Read & choose” and add some."}
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
          renderTerm={(senseRevisionId, children, key) => {
            const item = byRevision.get(senseRevisionId);
            if (!item) return children;
            const chosen = words.has(senseRevisionId);
            const style =
              mode === "study" && chosen
                ? "rounded-sm bg-accent-soft px-0.5 font-medium underline decoration-accent decoration-2 underline-offset-4"
                : chosen
                  ? "underline decoration-accent/60 decoration-1 underline-offset-4"
                  : "";
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

      <WordPanel
        items={items}
        language={words.language}
        languages={languages}
        setLanguage={words.setLanguage}
        has={words.has}
        toggle={toggle}
      />
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
