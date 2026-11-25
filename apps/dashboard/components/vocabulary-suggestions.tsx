"use client";

import type { SuggestionsFieldsFragment } from "@english/graphql";
import { useCallback, useEffect, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import { Spinner } from "./editor-section";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * While the worker looks for vocabulary: a moving bar, how long it has been, about how long it takes (the local AI
 * reads one paragraph in about a minute), and placeholders where the suggestions will appear.
 */
function Working({ paragraphs }: { paragraphs: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Math.max(1, paragraphs); // about a minute per paragraph on this Mac's CPU
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Spinner className="size-4" />
        Finding words, phrases and idioms in the script…
        <span className="ml-auto tabular-nums text-muted">{clock(seconds)} so far</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line/70" aria-hidden="true">
        <div className="vocab-progress absolute inset-y-0 w-1/3 rounded-full bg-accent" />
      </div>
      <p className="text-sm text-muted">
        The local AI reads one paragraph at a time: about {minutes} minute{minutes === 1 ? "" : "s"} for{" "}
        {paragraphs || 1} paragraph{paragraphs === 1 ? "" : "s"}. You can keep working; suggestions appear here.
      </p>
      <ul className="flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex animate-pulse gap-3 rounded-2xl border border-line bg-surface p-3 motion-reduce:animate-none"
          >
            <span className="mt-1 size-4 rounded bg-line" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3 w-1/3 rounded bg-line" />
              <span className="h-3 w-5/6 rounded bg-line/70" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Suggestion = SuggestionsFieldsFragment["items"][number];

const KIND: Record<string, string> = {
  WORD: "word",
  PHRASE: "phrase",
  COLLOCATION: "collocation",
  IDIOM: "idiom",
  PHRASAL_VERB: "phrasal verb",
  SENTENCE_PATTERN: "pattern",
};

/** The sentence with the suggested words in bold. */
function InSentence({ sentence, surface }: { sentence: string; surface: string }) {
  const at = sentence.indexOf(surface);
  if (at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <strong className="font-semibold text-ink">{surface}</strong>
      {sentence.slice(at + surface.length)}
    </>
  );
}

/**
 * Suggested vocabulary for the saved script (found in the background after each save). Editors tick what to keep:
 * Approve links each item in the text as a key word (bold in the script; new items go into the word bank as
 * drafts to check), Remove takes it off the list for good.
 */
export function VocabularySuggestions({
  resourceId,
  localizationId,
  lockVersion,
  editable,
  saved,
  data,
  onData: setData,
  paragraphs,
  onApproved,
}: {
  resourceId: string;
  localizationId: string;
  lockVersion: number;
  editable: boolean;
  /** Approving changes the text: everything must be saved first. */
  saved: boolean;
  /** The suggestions, kept by the page (its Vocabulary header sums them up). */
  data: SuggestionsFieldsFragment;
  onData: (data: SuggestionsFieldsFragment) => void;
  /** How many paragraphs the saved script has: the local AI reads one at a time. */
  paragraphs: number;
  /** After approving: the page reloads the draft (its text now has the new links). */
  onApproved: (message: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await actions.draftSuggestions(resourceId);
    if (r.ok) setData(r.suggestions);
  }, [resourceId, setData]);

  // Saving the script (a new lock version) starts a new search: show it.
  useEffect(() => {
    let live = true;
    void actions.draftSuggestions(resourceId).then((r) => {
      if (live && r.ok) setData(r.suggestions);
    });
    return () => {
      live = false;
    };
  }, [lockVersion, resourceId, setData]);

  // While the worker is looking, check every few seconds.
  useEffect(() => {
    if (data.state !== "WORKING") return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [data.state, refresh]);

  const open = data.items.filter((i) => i.status === "PENDING");
  const approved = data.items.filter((i) => i.status === "APPROVED").length;
  const removed = data.items.filter((i) => i.status === "REJECTED").length;
  const canAct = editable && saved && !pending;
  const picked = chosen.filter((id) => open.some((i) => i.id === id));

  function approve(ids: string[]) {
    start(async () => {
      const r = await actions.approveSuggestions(localizationId, lockVersion, ids);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setChosen([]);
      onApproved(`Approved ${ids.length} item(s): linked in the script as key words.`);
    });
  }
  function remove(ids: string[]) {
    start(async () => {
      const r = await actions.rejectSuggestions(localizationId, ids);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message ?? "Something went wrong." });
      setChosen([]);
      setMessage({ tone: "good", text: `Removed ${ids.length} item(s).` });
      await refresh();
    });
  }
  function again() {
    start(async () => {
      const r = await actions.suggestAgain(localizationId);
      setMessage(r.ok ? null : { tone: "bad", text: r.message ?? "Something went wrong." });
      await refresh();
    });
  }

  const button = "rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50";
  return (
    <section aria-labelledby="suggestions-heading" className="flex flex-col gap-3 rounded-2xl bg-sun/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="suggestions-heading" className="font-semibold">
          Suggested for this script
        </h3>
        {editable && data.state !== "WORKING" && data.state !== "IDLE" ? (
          <button
            type="button"
            onClick={again}
            disabled={pending}
            className={`${button} border border-line bg-surface`}
          >
            Suggest again
          </button>
        ) : null}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {data.state === "IDLE"
          ? "Save the script: words, phrases and idioms worth learning are suggested here."
          : data.state === "WORKING"
            ? ""
            : data.state === "FAILED"
              ? "The suggestions couldn't be made. Try “Suggest again”."
              : open.length
                ? `${open.length} to check · ${approved} approved · ${removed} removed`
                : `Nothing left to check · ${approved} approved · ${removed} removed`}
        {data.state === "DONE" && data.usedLanguageModel === false
          ? " · The local AI wasn't running, so these come from word frequency only (no idioms, no meanings). Start it, then “Suggest again”."
          : ""}
      </p>
      {data.state === "WORKING" ? <Working paragraphs={paragraphs} /> : null}
      {!saved && open.length ? <p className="text-sm text-bad">Save your changes before approving.</p> : null}

      {open.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={picked.length === open.length}
                disabled={!canAct}
                onChange={(e) => setChosen(e.target.checked ? open.map((i) => i.id) : [])}
              />
              Select all
            </label>
            <button
              type="button"
              disabled={!canAct || !picked.length}
              onClick={() => approve(picked)}
              className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
            >
              ✓ Approve selected ({picked.length})
            </button>
            <button
              type="button"
              disabled={!canAct || !picked.length}
              onClick={() => remove(picked)}
              className={`${button} border border-line bg-surface hover:border-bad hover:text-bad`}
            >
              ✕ Remove selected
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {open.map((s: Suggestion) => (
              <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3">
                <input
                  type="checkbox"
                  aria-label={`Select “${s.displayForm}”`}
                  className="mt-1"
                  checked={chosen.includes(s.id)}
                  disabled={!canAct}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id))}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.displayForm}</span>
                    <span className="text-xs italic text-muted">{KIND[s.kind] ?? s.partOfSpeech}</span>
                    {s.cefrLevel ? <span className="rounded-full bg-paper px-2 text-xs">{s.cefrLevel}</span> : null}
                    <span
                      className={`rounded-full px-2 text-xs font-semibold ${
                        s.inWordBank ? "bg-good-soft text-good" : "bg-sky text-on-pastel"
                      }`}
                    >
                      {s.inWordBank ? "In the word bank" : "New: added as a draft"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    <InSentence sentence={s.sentence} surface={s.surfaceText} />
                  </p>
                  {s.definition ? <p className="text-sm">{s.definition}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Approve “${s.displayForm}”`}
                    disabled={!canAct}
                    onClick={() => approve([s.id])}
                    className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove “${s.displayForm}”`}
                    disabled={!canAct}
                    onClick={() => remove([s.id])}
                    className={`${button} border border-line bg-surface hover:border-bad hover:text-bad`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {message ? (
        <p className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
