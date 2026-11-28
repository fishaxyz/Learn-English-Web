"use client";

import type { LexicalItemKind, ReadingLessonQuery } from "@english/graphql";
import { useState, type ReactNode } from "react";

type Lesson = Extract<NonNullable<ReadingLessonQuery["resourceBySlug"]>, { lexicalItems: unknown }>;
export type LexicalItem = Lesson["lexicalItems"][number];

const KIND: Record<LexicalItemKind, { one: string; many: string }> = {
  KEYWORD: { one: "Keyword", many: "Keywords" },
  COLLOCATION: { one: "Collocation", many: "Collocations" },
  IDIOM: { one: "Idiom", many: "Idioms" },
  PHRASAL_VERB: { one: "Phrasal verb", many: "Phrasal verbs" },
  STRUCTURE: { one: "Sentence structure", many: "Sentence structures" },
  PARAPHRASE: { one: "Paraphrase", many: "Paraphrases" },
};
const ORDER = Object.keys(KIND) as LexicalItemKind[];

/** The sentence with the item's words in bold, when they're there as written. */
function withItem(sentence: string, item: string): ReactNode {
  const at = sentence.toLowerCase().indexOf(item.toLowerCase());
  if (at < 0) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-semibold text-ink not-italic">{sentence.slice(at, at + item.length)}</strong>
      {sentence.slice(at + item.length)}
    </>
  );
}

/**
 * The lesson's Lexical Vocabulary tab (ADR 0010): the editor's chosen keywords, collocations, idioms and structures,
 * each explained for IELTS (meaning, synonyms, where it is in the text, an example and a tip). For studying on
 * one's own: nothing to save, nothing marked in the article.
 */
export function LexicalPanel({ items }: { items: LexicalItem[] }) {
  const [kind, setKind] = useState<LexicalItemKind | null>(null);
  if (!items.length) return <p className="text-muted">There is no lexical vocabulary for this lesson yet.</p>;
  const kinds = ORDER.filter((k) => items.some((i) => i.kind === k));
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const chip =
    "rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-accent aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";
  return (
    <section aria-labelledby="lexical-heading" className="flex flex-col gap-4">
      <h2 id="lexical-heading" className="font-display text-2xl font-semibold">
        Lexical vocabulary
      </h2>
      {kinds.length > 1 ? (
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={kind === null} onClick={() => setKind(null)} className={chip}>
            All ({items.length})
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip}>
              {KIND[k].many} ({items.filter((i) => i.kind === k).length})
            </button>
          ))}
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.id}>
            <article
              aria-labelledby={`item-${item.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
            >
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id={`item-${item.id}`} className="text-lg font-semibold">
                  {item.text}
                </h3>
                <span className="rounded-full bg-tag-amber-soft px-2 py-0.5 text-xs font-semibold text-tag-amber">
                  {KIND[item.kind].one}
                </span>
              </header>
              <p>{item.meaning}</p>
              {item.synonyms.length ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-muted">Synonyms:</span>
                  {item.synonyms.map((s) => (
                    <span key={s} className="rounded-full bg-tag-blue-soft px-2.5 py-0.5 text-tag-blue">
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.inText ? (
                <p className="border-l-2 border-accent/40 pl-3 text-sm text-muted">
                  <span className="font-semibold">In the text: </span>
                  <q className="italic">{withItem(item.inText, item.text)}</q>
                </p>
              ) : null}
              {item.example ? (
                <p className="text-sm">
                  <span className="font-semibold text-muted">Example: </span>
                  {item.example}
                </p>
              ) : null}
              {item.ieltsTip ? (
                <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
                  <span className="font-semibold">IELTS tip: </span>
                  {item.ieltsTip}
                </p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
