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

/** The sentence with the item's words in bold (a structure's fixed words, before its first "+"). */
function withItem(sentence: string, item: string): ReactNode {
  const words = (item.split(/\s\+\s/)[0] ?? "").trim();
  const at = words ? sentence.toLowerCase().indexOf(words.toLowerCase()) : -1;
  if (at < 0) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-semibold text-ink">{sentence.slice(at, at + words.length)}</strong>
      {sentence.slice(at + words.length)}
    </>
  );
}

const translationIn = (language: string, translations: { language: string; text: string }[]) =>
  translations.find((t) => t.language === language)?.text ?? null;

/** One item: closed, its words, kind and meaning; open, everything the sheet says about it. */
function Card({
  item,
  language,
  open,
  onToggle,
}: {
  item: LexicalItem;
  language: string;
  open: boolean;
  onToggle: () => void;
}) {
  const own = item.languages.find((l) => l.language === language);
  const [inText, others] = [item.examples.filter((e) => e.inText), item.examples.filter((e) => !e.inText)];
  const label = "text-xs font-semibold uppercase tracking-wide text-muted";
  const example = (e: LexicalItem["examples"][number]) => {
    const translation = translationIn(language, e.translations);
    return (
      <li key={e.text} className="flex flex-col gap-0.5">
        <span>{withItem(e.text, item.text)}</span>
        {translation ? (
          <span lang={language} className="text-sm text-muted">
            {translation}
          </span>
        ) : null}
      </li>
    );
  };
  const body = `item-${item.id}-body`;
  return (
    <article aria-labelledby={`item-${item.id}`} className="rounded-2xl border border-line bg-surface">
      <h3 id={`item-${item.id}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
          className="flex w-full flex-col gap-1 rounded-2xl p-5 text-left hover:bg-paper/60 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lg font-semibold">{item.text}</span>
            {item.partOfSpeech ? <span className="text-sm text-muted">({item.partOfSpeech})</span> : null}
            {item.pronunciation ? <span className="text-sm text-muted">{item.pronunciation}</span> : null}
            <span className="ml-auto flex items-center gap-1.5">
              {item.question ? (
                <span className="rounded-full bg-tag-blue-soft px-2 py-0.5 text-xs font-semibold text-tag-blue">
                  {item.question}
                </span>
              ) : null}
              <span className="rounded-full bg-tag-amber-soft px-2 py-0.5 text-xs font-semibold text-tag-amber">
                {KIND[item.kind].one}
              </span>
              <span aria-hidden="true" className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>
                ▾
              </span>
            </span>
          </span>
          {own?.meaning ? (
            <span lang={language} className="text-base font-semibold text-accent">
              {own.meaning}
            </span>
          ) : null}
        </button>
      </h3>
      <div id={body} hidden={!open} className="flex flex-col gap-4 px-5 pb-5">
        {item.definition || own?.definition ? (
          <div className="flex flex-col gap-1">
            {item.definition ? <p>{item.definition}</p> : null}
            {own?.definition ? (
              <p lang={language} className="text-sm text-muted">
                {own.definition}
              </p>
            ) : null}
          </div>
        ) : null}

        {item.pairedWith ? (
          // The heading is the text's words; the question rewords them.
          <div className="flex flex-col gap-1 rounded-xl bg-paper px-3 py-2">
            <p className={label}>In the question</p>
            <p>{item.pairedWith}</p>
          </div>
        ) : null}

        {item.usage ? (
          <div className="flex flex-col gap-1">
            <p className={label}>How to use it</p>
            <p className="rounded-xl bg-paper px-3 py-2 font-mono text-sm">{item.usage}</p>
          </div>
        ) : null}

        {inText.length ? (
          <div className="flex flex-col gap-1 border-l-2 border-accent/40 pl-3">
            <p className={label}>In the text</p>
            <ul className="flex flex-col gap-2">{inText.map(example)}</ul>
          </div>
        ) : null}
        {others.length ? (
          <div className="flex flex-col gap-1">
            <p className={label}>{inText.length ? "More examples" : "Examples"}</p>
            <ul className="flex flex-col gap-2">{others.map(example)}</ul>
          </div>
        ) : null}

        {item.synonyms.length ? (
          <div className="flex flex-col gap-1">
            <p className={label}>Synonyms</p>
            <ul className="flex flex-col gap-1.5">
              {item.synonyms.map((s) => {
                const translation = translationIn(language, s.translations);
                return (
                  <li key={s.text} className="text-sm">
                    <span className="rounded-full bg-tag-blue-soft px-2.5 py-0.5 font-semibold text-tag-blue">
                      {s.text}
                    </span>
                    {s.note ? <span className="text-muted"> {s.note}</span> : null}
                    {translation ? (
                      <span lang={language} className="text-muted">
                        {" "}
                        ({translation})
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {own?.notes.length ? (
          <ul className="flex flex-col gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink">
            {own.notes.map((n) => (
              <li key={n.text} lang={language}>
                <span className="font-semibold">Note: </span>
                {n.text}
                {n.translation ? <span className="block text-muted">{n.translation}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The lesson's Lexical Vocabulary tab (ADRs 0010, 0011): the editor's own vocabulary sheet (keywords, collocations,
 * idioms, structures and paraphrase pairs), with meanings and translations in the learner's chosen language. For
 * studying on one's own: nothing to save, nothing marked in the article.
 */
export function LexicalPanel({ items, language }: { items: LexicalItem[]; language: string }) {
  const [kind, setKind] = useState<LexicalItemKind | null>(null);
  // Cards start closed: a list of words and meanings to scan, each opened to study it.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  if (!items.length) return <p className="text-muted">There is no lexical vocabulary for this lesson yet.</p>;
  const kinds = ORDER.filter((k) => items.some((i) => i.kind === k));
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const allOpen = shown.every((i) => opened.has(i.id));
  const toggle = (id: string) =>
    setOpened((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const chip =
    "rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-accent aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";
  return (
    <section aria-labelledby="lexical-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lexical-heading" className="font-display text-2xl font-semibold">
          Lexical vocabulary
        </h2>
        <button
          type="button"
          onClick={() =>
            setOpened((now) => {
              const next = new Set(now);
              for (const i of shown) {
                if (allOpen) next.delete(i.id);
                else next.add(i.id);
              }
              return next;
            })
          }
          className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-accent"
        >
          {allOpen ? "Close all" : "Open all"}
        </button>
      </div>
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
            <Card item={item} language={language} open={opened.has(item.id)} onToggle={() => toggle(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
