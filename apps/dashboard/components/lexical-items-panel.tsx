"use client";

import type { DraftLexicalItemsFieldsFragment, LexicalItemKind } from "@english/graphql";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { ListFileError, readListFile } from "../lib/list-file";
import { Working } from "./working";

export const KIND_LABEL: Record<LexicalItemKind, string> = {
  KEYWORD: "Keyword",
  COLLOCATION: "Collocation",
  IDIOM: "Idiom",
  PHRASAL_VERB: "Phrasal verb",
  STRUCTURE: "Sentence structure",
  PARAPHRASE: "Paraphrase",
};
const KINDS = Object.keys(KIND_LABEL) as LexicalItemKind[];

export const emptyLexicalItems: DraftLexicalItemsFieldsFragment = { state: "IDLE", usedLanguageModel: null, items: [] };

/** Counts for the Lexical vocabulary header. */
export function lexicalCounts(data: DraftLexicalItemsFieldsFragment) {
  const count = (status: string) => data.items.filter((i) => i.status === status).length;
  return {
    approved: count("APPROVED"),
    toCheck: count("DRAFT"),
    waiting: count("PENDING"),
    working: data.state === "WORKING",
  };
}

type Item = DraftLexicalItemsFieldsFragment["items"][number];
type Fields = { kind: LexicalItemKind; meaning: string; synonyms: string; example: string; ieltsTip: string };

const fieldsOf = (i: Item): Fields => ({
  kind: i.kind ?? "KEYWORD",
  meaning: i.meaning ?? "",
  synonyms: i.synonyms.join(", "),
  example: i.example ?? "",
  ieltsTip: i.ieltsTip ?? "",
});
const approvalOf = (id: string, f: Fields) => ({
  id,
  kind: f.kind,
  meaning: f.meaning,
  synonyms: f.synonyms
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean),
  example: f.example.trim() || null,
  ieltsTip: f.ieltsTip.trim() || null,
});

const EXAMPLE = "rely on\na grain of truth — idiom\npass on — phrasal verb\nIt was not until … that — structure";

/**
 * The lesson's own lexical vocabulary (ADR 0010): the editor adds a list (typed, pasted, or from a .txt or .docx
 * file), the local AI explains each item for IELTS learners, and the editor checks, edits and approves. Learners
 * see approved items in the Lexical Vocabulary tab. Each lesson keeps its own items.
 */
export function LexicalItemsPanel({
  resourceId,
  localizationId,
  lockVersion,
  editable,
  saved,
  hasScript,
  ensureSaved,
  data,
  onData: setData,
}: {
  resourceId: string;
  localizationId: string;
  lockVersion: number;
  editable: boolean;
  /** The AI explains items with the saved script: everything must be saved first. */
  saved: boolean;
  hasScript: boolean;
  ensureSaved: () => Promise<boolean>;
  /** Kept by the page (its header sums it up). */
  data: DraftLexicalItemsFieldsFragment;
  onData: (data: DraftLexicalItemsFieldsFragment) => void;
}) {
  const [list, setList] = useState("");
  const [edits, setEdits] = useState<Record<string, Fields>>({});
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const listId = useId();
  const fileId = useId();

  const refresh = useCallback(async () => {
    const r = await actions.draftLexicalItems(resourceId);
    if (r.ok) setData(r.items);
    else setMessage({ tone: "bad", text: r.message });
  }, [resourceId, setData]);

  // A saved script moves the items' sentences: load what's there now.
  useEffect(() => {
    let live = true;
    void actions.draftLexicalItems(resourceId).then((r) => {
      if (live && r.ok) setData(r.items);
    });
    return () => {
      live = false;
    };
  }, [lockVersion, resourceId, setData]);

  // While the AI is explaining, check every few seconds.
  useEffect(() => {
    if (data.state !== "WORKING") return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [data.state, refresh]);

  const { approved, toCheck, waiting, working } = lexicalCounts(data);
  const canAct = editable && !pending && !working;
  const fields = (i: Item) => edits[i.id] ?? fieldsOf(i);
  const edited = (i: Item) => !!edits[i.id] && JSON.stringify(edits[i.id]) !== JSON.stringify(fieldsOf(i));
  const change = (i: Item, patch: Partial<Fields>) =>
    setEdits((now) => ({ ...now, [i.id]: { ...fields(i), ...patch } }));
  const forget = (ids: string[]) =>
    setEdits((now) => Object.fromEntries(Object.entries(now).filter(([id]) => !ids.includes(id))));

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const text = await readListFile(file);
      setList((now) => [now.trim(), text.trim()].filter(Boolean).join("\n"));
      setMessage({ tone: "good", text: `Read “${file.name}”: check the list, then add it.` });
    } catch (error) {
      setMessage({
        tone: "bad",
        text: error instanceof ListFileError ? error.message : "That file couldn't be read.",
      });
    }
  }

  function add() {
    start(async () => {
      if (!(await ensureSaved())) return;
      const r = await actions.addLexicalList(localizationId, list);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setList("");
      const plural = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
      setMessage({
        tone: "good",
        text: `Added ${plural(r.added)}${r.skipped ? ` (${plural(r.skipped)} already in the list)` : ""}.`,
      });
      await refresh();
    });
  }

  function explain(redo: boolean) {
    start(async () => {
      if (!(await ensureSaved())) return;
      const r = await actions.explainLexicalItems(localizationId, redo);
      setMessage(r.ok ? null : { tone: "bad", text: r.message ?? "Something went wrong." });
      if (redo) forget(data.items.filter((i) => i.status === "DRAFT").map((i) => i.id));
      await refresh();
    });
  }

  function approve(items: Item[]) {
    const approvals = items.map((i) => approvalOf(i.id, fields(i)));
    if (approvals.some((a) => !a.meaning.trim())) {
      setMessage({ tone: "bad", text: "Every item needs a meaning." });
      return;
    }
    start(async () => {
      const r = await actions.approveLexicalItems(localizationId, approvals);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      forget(items.map((i) => i.id));
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
        List the keywords, collocations, idioms and sentence structures learners should study in this text. The local AI
        explains each one for IELTS (meaning, synonyms, an example, a tip); you check, edit and approve. Learners see
        approved items in the lesson&apos;s Lexical Vocabulary tab.
      </p>

      {editable ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <label htmlFor={listId} className="text-sm font-semibold">
            Your list{" "}
            <span className="font-normal text-muted">(one item per line; a note after “ — ” is optional)</span>
          </label>
          <textarea
            id={listId}
            value={list}
            onChange={(e) => setList(e.target.value)}
            placeholder={EXAMPLE}
            rows={5}
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
              onClick={add}
              disabled={!list.trim() || !hasScript || !canAct}
              title={hasScript ? undefined : "Write the script first"}
              className={`${primary} ml-auto`}
            >
              {pending ? "Working…" : "Add to the list"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {editable && waiting && !working ? (
          <button type="button" onClick={() => explain(false)} disabled={!canAct} className={primary}>
            Explain the waiting items ({waiting})
          </button>
        ) : null}
        {editable && toCheck && !working ? (
          <>
            <button type="button" onClick={() => explain(true)} disabled={!canAct} className={secondary}>
              Explain drafts again
            </button>
            <button
              type="button"
              onClick={() => approve(data.items.filter((i) => i.status === "DRAFT"))}
              disabled={!canAct}
              className={primary}
            >
              ✓ Approve all drafts ({toCheck})
            </button>
          </>
        ) : null}
        {data.items.length ? (
          <span className="ml-auto text-sm text-muted" aria-live="polite">
            {approved} approved · {toCheck} to check · {waiting} waiting
          </span>
        ) : null}
      </div>

      {working ? (
        <Working
          label="Explaining the list…"
          note={`The local AI explains a few items at a time: about a minute for every 5 items (${waiting} waiting). You can keep working; explanations appear here.`}
          rows={2}
        />
      ) : null}
      {data.state === "FAILED" ? (
        <p className="text-sm text-bad">The list couldn&apos;t be explained. Try “Explain the waiting items” again.</p>
      ) : null}
      {data.state === "DONE" && data.usedLanguageModel === false && waiting ? (
        <p className="text-sm text-bad">
          The local AI wasn&apos;t running, so nothing was explained. Start it, then press “Explain the waiting items”.
        </p>
      ) : null}
      {!saved ? (
        <p className="text-sm text-bad">Save the script first: items are explained with the saved script.</p>
      ) : null}
      {message ? (
        <p role="status" className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>
          {message.text}
        </p>
      ) : null}

      {data.items.length ? (
        <ol className="flex flex-col gap-3">
          {data.items.map((item) => {
            const f = fields(item);
            const changed = edited(item);
            const locked = !editable || pending;
            const name = `“${item.text}”`;
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{item.text}</h4>
                  {item.note ? <span className="text-sm text-muted">— {item.note}</span> : null}
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                      changed
                        ? "bg-sun text-on-pastel"
                        : item.status === "APPROVED"
                          ? "bg-good-soft text-good"
                          : item.status === "DRAFT"
                            ? "bg-sky text-on-pastel"
                            : "bg-line text-muted"
                    }`}
                  >
                    {changed
                      ? "Edited"
                      : item.status === "APPROVED"
                        ? "Approved"
                        : item.status === "DRAFT"
                          ? "Draft"
                          : "Waiting for the AI"}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {item.inText ? (
                    <>
                      In this text: <q className="italic">{item.inText}</q>
                    </>
                  ) : (
                    "Not found in this text."
                  )}
                </p>
                {item.status !== "PENDING" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      Kind
                      <select
                        value={f.kind}
                        disabled={locked}
                        aria-label={`Kind of ${name}`}
                        onChange={(e) => change(item, { kind: e.target.value as LexicalItemKind })}
                        className={input}
                      >
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Synonyms / paraphrases <span className="text-muted">(separated by commas)</span>
                      <input
                        value={f.synonyms}
                        disabled={locked}
                        aria-label={`Synonyms of ${name}`}
                        onChange={(e) => change(item, { synonyms: e.target.value })}
                        className={input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      Meaning
                      <textarea
                        value={f.meaning}
                        disabled={locked}
                        aria-label={`Meaning of ${name}`}
                        rows={2}
                        onChange={(e) => change(item, { meaning: e.target.value })}
                        className={input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Example
                      <textarea
                        value={f.example}
                        disabled={locked}
                        aria-label={`Example for ${name}`}
                        rows={2}
                        onChange={(e) => change(item, { example: e.target.value })}
                        className={input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      IELTS tip
                      <textarea
                        value={f.ieltsTip}
                        disabled={locked}
                        aria-label={`IELTS tip for ${name}`}
                        rows={2}
                        onChange={(e) => change(item, { ieltsTip: e.target.value })}
                        className={input}
                      />
                    </label>
                  </div>
                ) : null}
                {editable ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => remove(item)}
                      disabled={!canAct}
                      className={secondary}
                    >
                      Remove
                    </button>
                    {item.status === "DRAFT" || (item.status === "APPROVED" && changed) ? (
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
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
