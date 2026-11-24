"use client";

import Link from "next/link";
import { languageName } from "../../components/word-card";
import { useMyWords, type SavedItem } from "../../lib/my-words";
import { useSpeech } from "../../lib/speech";

/** Every word and structure the learner chose, grouped by the reading it came from. Kept in this browser. */
export function MyWordsList() {
  const words = useMyWords();
  const { available, speak } = useSpeech();
  const languages = [...new Set(words.items.flatMap((i) => i.translations.map((t) => t.locale)))].sort();
  const byLesson = new Map<string, { title: string; items: SavedItem[] }>();
  for (const item of words.items) {
    const group = byLesson.get(item.lesson.slug) ?? { title: item.lesson.title, items: [] };
    group.items.push(item);
    byLesson.set(item.lesson.slug, group);
  }

  if (!words.items.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line p-8">
        <p className="text-lg">Your list is empty.</p>
        <p className="text-muted">Open a reading, tap the words and phrases you want to learn, and add them here.</p>
        <Link
          href="/reading"
          className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong"
        >
          Find a reading
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {words.items.length} {words.items.length === 1 ? "item" : "items"}, saved in this browser.
        </p>
        {languages.length ? (
          <label className="flex items-center gap-2 text-sm">
            Translations in
            <select
              value={words.language ?? ""}
              onChange={(e) => words.setLanguage(e.target.value || null)}
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
      {[...byLesson.entries()].map(([slug, group]) => (
        <section key={slug} aria-labelledby={`from-${slug}`} className="flex flex-col gap-3">
          <h2 id={`from-${slug}`} className="text-sm font-semibold uppercase tracking-wider text-muted">
            From{" "}
            <Link href={`/reading/${slug}`} className="normal-case tracking-normal text-accent hover:underline">
              {group.title}
            </Link>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((item) => {
              const translation = words.language
                ? item.translations.find((t) => t.locale === words.language)
                : undefined;
              const spoken = item.kind === "SENTENCE_PATTERN" ? item.surface : item.displayForm;
              return (
                <li
                  key={item.senseRevisionId}
                  className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{item.displayForm}</p>
                    <span className="text-sm italic text-muted">{item.partOfSpeech}</span>
                  </div>
                  {translation ? (
                    <p lang={translation.locale} className="font-medium text-accent">
                      {translation.text}
                    </p>
                  ) : null}
                  <p className="text-sm">{item.definition}</p>
                  {item.sentence ? <p className="text-sm italic text-muted">“{item.sentence}”</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {available ? (
                      <>
                        <button
                          type="button"
                          onClick={() => speak(spoken, "en-GB")}
                          className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
                        >
                          <span aria-hidden="true">🔊</span> UK<span className="sr-only">: listen to “{spoken}”</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => speak(spoken, "en-US")}
                          className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
                        >
                          <span aria-hidden="true">🔊</span> US<span className="sr-only">: listen to “{spoken}”</span>
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => words.remove(item.senseRevisionId)}
                      className="ml-auto text-sm text-muted hover:text-bad"
                    >
                      Remove<span className="sr-only"> “{item.displayForm}”</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
