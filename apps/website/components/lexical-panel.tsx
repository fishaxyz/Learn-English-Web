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

function Card({ item, language }: { item: LexicalItem; language: string }) {
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
  return (
    <article
      aria-labelledby={`item-${item.id}`}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 id={`item-${item.id}`} className="text-lg font-semibold">
            {item.text}
          </h3>
          {item.partOfSpeech ? <span className="text-sm text-muted">({item.partOfSpeech})</span> : null}
          {item.pronunciation ? <span className="text-sm text-muted">{item.pronunciation}</span> : null}
          <span className="ml-auto flex gap-1.5">
            {item.question ? (
              <span className="rounded-full bg-tag-blue-soft px-2 py-0.5 text-xs font-semibold text-tag-blue">
                {item.question}
              </span>
            ) : null}
            <span className="rounded-full bg-tag-amber-soft px-2 py-0.5 text-xs font-semibold text-tag-amber">
              {KIND[item.kind].one}
            </span>
          </span>
        </div>
        {own?.meaning ? (
          <p lang={language} className="text-base font-semibold text-accent">
            {own.meaning}
          </p>
        ) : null}
        {item.definition ? <p>{item.definition}</p> : null}
        {own?.definition ? (
          <p lang={language} className="text-sm text-muted">
            {own.definition}
          </p>
        ) : null}
      </header>

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
            <Card item={item} language={language} />
          </li>
        ))}
      </ul>
    </section>
  );
}
