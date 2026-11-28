"use client";

import type { LexicalItemFieldsFragment, LexicalItemKind } from "@english/graphql";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { ListFileError, readListFile } from "../lib/list-file";

export const KIND_LABEL: Record<LexicalItemKind, string> = {
  KEYWORD: "Keyword",
  COLLOCATION: "Collocation",
  IDIOM: "Idiom",
  PHRASAL_VERB: "Phrasal verb",
  STRUCTURE: "Sentence structure",
  PARAPHRASE: "Paraphrase",
};
const KINDS = Object.keys(KIND_LABEL) as LexicalItemKind[];

/** The native languages a sheet's meanings and translations can be in (as the reading page's translations). */
const LANGUAGES = [
  { code: "vi", name: "Vietnamese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
];
const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

type Item = LexicalItemFieldsFragment;

/** Counts for the Lexical vocabulary header. */
export function lexicalCounts(items: Item[]) {
  return {
    approved: items.filter((i) => i.status === "APPROVED").length,
    toCheck: items.filter((i) => i.status === "DRAFT").length,
  };
}

/** A blank sheet in the layout the reader understands, for editors to fill in. */
const TEMPLATE = `VOCABULARY – (lesson title)

A. Vocabulary

1. word (v) /pronunciation/ – meaning in the learners' language
the English definition
Usage: word + something; another pattern
Example: a sentence from the text.
→ its translation
Another example sentence.
→ its translation
Synonyms:
  synonym – when to use it (translation)
Note: a common mistake, the word family…
→ its translation, if any

B. Phrases & collocations

2. a phrase (phr) – meaning

C. Idioms

3. an idiom (idiom) – meaning

D. Useful structures

4. Only recently have + S + V3 – meaning
Use: when to use it (translation)
Example: a sentence from the text.
→ its translation

E. Paraphrase pairs

5. words in the text ↔ words in the question – meaning (Q1)
`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The item as learners will see it, all languages shown, for checking. */
function ItemPreview({ item }: { item: Item }) {
  const label = "font-semibold text-muted";
  return (
    <div className="flex flex-col gap-2 text-sm">
      {item.definition ? <p>{item.definition}</p> : null}
      {item.languages.map((l) => (
        <div key={l.language} className="flex flex-col gap-1 rounded-xl bg-paper px-3 py-2">
          <p>
            <span className={label}>{languageName(l.language)}: </span>
            {[l.meaning, l.definition].filter(Boolean).join(" · ") || "—"}
          </p>
          {l.notes.map((n, i) => (
            <p key={i} className="text-muted">
              Note: {n.text}
              {n.translation ? <> → {n.translation}</> : null}
            </p>
          ))}
        </div>
      ))}
      {item.pairedWith ? (
        <p>
          <span className={label}>In the question: </span>
          {item.pairedWith}
        </p>
      ) : null}
      {item.usage ? (
        <p>
          <span className={label}>Usage: </span>
          {item.usage}
        </p>
      ) : null}
      {item.examples.length ? (
        <div>
          <p className={label}>Examples</p>
          <ul className="flex flex-col gap-1 pl-4">
            {item.examples.map((e, i) => (
              <li key={i} className="list-disc">
                {e.text}{" "}
                {e.inText ? (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">
                    In the text
                  </span>
                ) : null}
                {e.translations.map((t) => (
                  <span key={t.language} className="block text-muted">
                    {t.language}: {t.text}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {item.synonyms.length ? (
        <div>
          <p className={label}>Synonyms</p>
          <ul className="flex flex-col gap-1 pl-4">
            {item.synonyms.map((s, i) => (
              <li key={i} className="list-disc">
                <span className="font-semibold">{s.text}</span>
                {s.note ? ` – ${s.note}` : ""}
                {s.translations.length ? (
                  <span className="text-muted">
                    {" "}
                    ({s.translations.map((t) => `${t.language}: ${t.text}`).join("; ")})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The lesson's own lexical vocabulary (ADRs 0010, 0011): the editor adds a vocabulary sheet (pasted, or a .txt or
 * .docx file) whose explanations are their own, in one native language; the editor checks and approves each item.
 * A sheet in another language adds that language to the same items. Learners see approved items in the lesson's
 * Lexical Vocabulary tab. Each lesson keeps its own items.
 */
export function LexicalItemsPanel({
  resourceId,
  localizationId,
  lockVersion,
  editable,
  items,
  onItems: setItems,
}: {
  resourceId: string;
  localizationId: string;
  lockVersion: number;
  editable: boolean;
  /** Kept by the page (its header sums it up). */
  items: Item[];
  onItems: (items: Item[]) => void;
}) {
  const [sheet, setSheet] = useState("");
  const [language, setLanguage] = useState("vi");
  const [kinds, setKinds] = useState<Record<string, LexicalItemKind>>({});
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const sheetId = useId();
  const fileId = useId();
  const languageId = useId();

  const refresh = useCallback(async () => {
    const r = await actions.draftLexicalItems(resourceId);
    if (r.ok) setItems(r.items);
    else setMessage({ tone: "bad", text: r.message });
  }, [resourceId, setItems]);

  // A saved script changes which examples are in the text: load what's there now.
  useEffect(() => {
    let live = true;
    void actions.draftLexicalItems(resourceId).then((r) => {
      if (live && r.ok) setItems(r.items);
    });
    return () => {
      live = false;
    };
  }, [lockVersion, resourceId, setItems]);

  const { approved, toCheck } = lexicalCounts(items);
  const canAct = editable && !pending;
  const kindOf = (i: Item) => kinds[i.id] ?? i.kind;
  const forget = (ids: string[]) =>
    setKinds((now) => Object.fromEntries(Object.entries(now).filter(([id]) => !ids.includes(id))));

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setSheet(await readListFile(file));
      setMessage({ tone: "good", text: `Read “${file.name}”: check the language, then add the sheet.` });
    } catch (error) {
      setMessage({ tone: "bad", text: error instanceof ListFileError ? error.message : "That file couldn't be read." });
    }
  }

  function add() {
    start(async () => {
      const r = await actions.addLexicalSheet(localizationId, sheet, language);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setSheet("");
      const plural = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
      setMessage({
        tone: "good",
        text: `Added ${plural(r.added)}${r.updated ? `, updated ${plural(r.updated)} (check them again)` : ""}.`,
      });
      await refresh();
    });
  }

  function approve(list: Item[]) {
    start(async () => {
      const r = await actions.approveLexicalItems(
        localizationId,
        list.map((i) => ({ id: i.id, kind: kindOf(i) }))
      );
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      forget(list.map((i) => i.id));
      setMessage({ tone: "good", text: `Approved ${r.count} item${r.count === 1 ? "" : "s"}.` });
      await refresh();
    });
  }

  function remove(item: Item) {
    start(async () => {
      const r = await actions.deleteLexicalItems(localizationId, [item.id]);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      forget([item.id]);
      setMessage({ tone: "good", text: `Removed “${item.text}”.` });
      await refresh();
    });
  }

  const button = "rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50";
  const primary = `${button} bg-accent text-on-accent hover:bg-accent-strong`;
  const secondary = `${button} border border-line bg-surface hover:border-accent`;
  const input = "rounded-xl border border-line bg-paper px-3 py-2 text-sm disabled:opacity-70";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Add the lesson&apos;s vocabulary sheet: keywords, collocations, idioms, structures and paraphrase pairs with
        your own explanations. It&apos;s read as you wrote it; check each item, then approve it. Learners see approved
        items in the Lexical Vocabulary tab, with the meanings and translations for their own language.
      </p>

      {editable ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <label htmlFor={sheetId} className="text-sm font-semibold">
            Vocabulary sheet <span className="font-normal text-muted">(paste it here, or choose a file)</span>
          </label>
          <textarea
            id={sheetId}
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
            placeholder={"A. Vocabulary\n1. disrupt (v) /dɪsˈrʌpt/ – làm gián đoạn\nto stop something from continuing…"}
            rows={6}
            className={`${input} font-mono`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={fileId} className={`${secondary} cursor-pointer`}>
              Choose a file (.txt or .docx)
            </label>
            <input
              id={fileId}
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => download("vocabulary-sheet-template.txt", TEMPLATE)}
              className={secondary}
            >
              Download a blank template
            </button>
            <label htmlFor={languageId} className="ml-auto text-sm">
              Meanings and translations in
            </label>
            <select id={languageId} value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={add} disabled={!sheet.trim() || !canAct} className={primary}>
              {pending ? "Working…" : "Add the sheet"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {editable && toCheck ? (
          <button
            type="button"
            onClick={() => approve(items.filter((i) => i.status === "DRAFT"))}
            disabled={!canAct}
            className={primary}
          >
            ✓ Approve all drafts ({toCheck})
          </button>
        ) : null}
        {items.length ? (
          <span className="ml-auto text-sm text-muted" aria-live="polite">
            {approved} approved · {toCheck} to check
          </span>
        ) : null}
      </div>

      {message ? (
        <p role="status" className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>
          {message.text}
        </p>
      ) : null}

      {items.length ? (
        <ol className="flex flex-col gap-2">
          {items.map((item) => {
            const kind = kindOf(item);
            const changed = kind !== item.kind;
            const name = `“${item.text}”`;
            const meaning = item.languages.find((l) => l.meaning)?.meaning;
            return (
              <li key={item.id} className="rounded-2xl border border-line bg-surface">
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 p-4">
                    <span className="font-semibold">{item.text}</span>
                    {item.partOfSpeech ? <span className="text-sm text-muted">({item.partOfSpeech})</span> : null}
                    {item.pronunciation ? <span className="text-sm text-muted">{item.pronunciation}</span> : null}
                    {item.question ? (
                      <span className="rounded-full bg-sky px-2 py-0.5 text-xs font-semibold text-on-pastel">
                        {item.question}
                      </span>
                    ) : null}
                    {meaning ? <span className="text-sm text-muted">– {meaning}</span> : null}
                    <span className="ml-auto flex items-center gap-2">
                      {item.languages.map((l) => (
                        <span key={l.language} className="text-xs font-semibold uppercase text-muted">
                          {l.language}
                        </span>
                      ))}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          changed
                            ? "bg-sun text-on-pastel"
                            : item.status === "APPROVED"
                              ? "bg-good-soft text-good"
                              : "bg-sky text-on-pastel"
                        }`}
                      >
                        {changed ? "Edited" : item.status === "APPROVED" ? "Approved" : "Draft"}
                      </span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-line p-4">
                    <ItemPreview item={item} />
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        Kind
                        <select
                          value={kind}
                          disabled={!canAct}
                          aria-label={`Kind of ${name}`}
                          onChange={(e) =>
                            setKinds((now) => ({ ...now, [item.id]: e.target.value as LexicalItemKind }))
                          }
                          className={input}
                        >
                          {KINDS.map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {editable ? (
                        <span className="ml-auto flex gap-2">
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            onClick={() => remove(item)}
                            disabled={!canAct}
                            className={secondary}
                          >
                            Remove
                          </button>
                          {item.status === "DRAFT" || changed ? (
                            <button
                              type="button"
                              aria-label={`Approve ${name}`}
                              onClick={() => approve([item])}
                              disabled={!canAct}
                              className={primary}
                            >
                              ✓ Approve
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
