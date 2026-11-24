"use client";

import type { SenseCardFragment } from "@english/graphql";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ACCENTS: Record<string, string> = { "en-GB": "UK", "en-US": "US", "en-AU": "Australia" };

/** One sense of a word: what learners need to understand it in context (AGENTS.md §5.3). */
export function LexicalCard({ sense, headingLevel = 3 }: { sense: SenseCardFragment; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Heading className="font-display text-xl font-semibold text-ink">{sense.entry.displayForm}</Heading>
        <span className="text-sm italic text-muted">{sense.partOfSpeech}</span>
        {sense.cefrLevel ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
            {sense.cefrLevel}
          </span>
        ) : null}
        {sense.register ? <span className="text-xs text-muted">({sense.register})</span> : null}
      </div>
      {sense.pronunciations.length ? (
        <p className="flex flex-wrap gap-x-3 text-sm text-muted">
          {sense.pronunciations.map((p) => (
            <span key={p.accent}>
              <span className="font-medium">{ACCENTS[p.accent] ?? p.accent}</span> <span lang="en-fonipa">{p.ipa}</span>
            </span>
          ))}
        </p>
      ) : null}
      <p className="text-ink">{sense.definition}</p>
      {sense.examples.length ? (
        <ul className="flex flex-col gap-1 border-l-2 border-accent-soft pl-3 text-sm text-ink/80">
          {sense.examples.map((e) => (
            <li key={e.sentence}>
              <q className="italic">{e.sentence}</q>
            </li>
          ))}
        </ul>
      ) : null}
      {sense.usageNote ? <p className="text-sm text-muted">{sense.usageNote}</p> : null}
    </div>
  );
}

/**
 * A linked word in the text. Pressing it opens its card; Escape or pressing outside closes it, and focus goes
 * back to the word. Works with keyboard, mouse and touch. The card is rendered outside the paragraph (a portal),
 * so the page stays valid HTML and the text's styles don't leak into it.
 */
export function LexicalTerm({ sense, children }: { sense: SenseCardFragment | undefined; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Place the card under the word, kept inside the window, and follow the word on scroll or resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(352, window.innerWidth * 0.9);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPosition({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as globalThis.Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!sense) return <>{children}</>;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-sm bg-accent-soft/60 px-0.5 text-inherit underline decoration-accent decoration-dotted decoration-2 underline-offset-4 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
      >
        {children}
      </button>
      {open && position
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={`Meaning of ${sense.entry.displayForm}`}
              style={{ top: position.top, left: position.left }}
              className="fixed z-50 w-[min(22rem,90vw)] rounded-xl border border-line bg-surface p-4 font-sans text-base shadow-lg"
            >
              <LexicalCard sense={sense} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
