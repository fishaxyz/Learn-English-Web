"use client";

import type { VocabularyItemViewFragment } from "@english/graphql";
import { LevelBadge } from "@english/ui";
import { useSpeech } from "../lib/speech";

const KIND_LABEL: Record<string, string> = {
  WORD: "word",
  PHRASE: "phrase",
  COLLOCATION: "collocation",
  IDIOM: "idiom",
  PHRASAL_VERB: "phrasal verb",
  SENTENCE_PATTERN: "sentence pattern",
};

export const isStructure = (kind: string) => kind !== "WORD";

export const languageName = (locale: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};

/** The sentence with the item's words in bold. */
function InContext({ sentence, text }: { sentence: string; text: string }) {
  const at = sentence.indexOf(text);
  if (at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-semibold text-ink">{text}</strong>
      {sentence.slice(at + text.length)}
    </>
  );
}

/**
 * Everything about one word or structure: meaning, translation in the learner's language, pronunciation,
 * the sentence from this text, more examples, and the button to add it to (or remove it from) their list.
 */
export function WordCard({
  item,
  language,
  inList,
  onToggle,
}: {
  item: VocabularyItemViewFragment;
  language: string | null;
  inList: boolean;
  onToggle: () => void;
}) {
  const { sense } = item;
  const { available, speak } = useSpeech();
  const structure = isStructure(sense.entry.kind);
  const first = item.occurrences[0];
  // Patterns ("like + verb-ing") are spoken as they appear in the text; everything else by its base form.
  const spoken = sense.entry.kind === "SENTENCE_PATTERN" && first ? first.text : sense.entry.displayForm;
  const translation = language ? sense.translations.find((t) => t.locale === language) : undefined;
  const ipa = (accent: string) => sense.pronunciations.find((p) => p.accent === accent)?.ipa;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-display text-xl font-semibold text-ink">{sense.entry.displayForm}</h3>
        <span className="text-sm italic text-muted">{KIND_LABEL[sense.entry.kind] ?? sense.partOfSpeech}</span>
        <LevelBadge level={sense.cefrLevel} />
        {item.isKey ? <span className="text-xs font-semibold text-accent">★ Key word</span> : null}
      </div>

      {available ? (
        <div className="flex flex-wrap gap-2">
          {(["en-GB", "en-US"] as const).map((accent) => (
            <button
              key={accent}
              type="button"
              onClick={() => speak(spoken, accent)}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
            >
              <span aria-hidden="true">🔊</span>
              {accent === "en-GB" ? "UK" : "US"}
              {ipa(accent) && !structure ? <span className="text-muted">{ipa(accent)}</span> : null}
              <span className="sr-only">: listen to “{spoken}”</span>
            </button>
          ))}
        </div>
      ) : null}

      {translation ? (
        <p lang={translation.locale} className="rounded-lg bg-accent-soft px-3 py-2 font-medium text-ink">
          {translation.text}
        </p>
      ) : null}
      <p className="text-ink">{sense.definition}</p>

      {first ? (
        <div className="text-sm">
          <p className="font-medium text-muted">In this text</p>
          <p className="text-ink/90">
            <InContext sentence={first.sentence} text={first.text} />
          </p>
        </div>
      ) : null}
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

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={inList}
        className={
          inList
            ? "rounded-full border border-accent px-4 py-2 font-semibold text-accent hover:bg-accent-soft"
            : "rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong"
        }
      >
        {inList
          ? "✓ In my list · Remove"
          : structure
            ? "＋ Add the whole " + (KIND_LABEL[sense.entry.kind] ?? "phrase")
            : "＋ Add to my list"}
      </button>
    </div>
  );
}
