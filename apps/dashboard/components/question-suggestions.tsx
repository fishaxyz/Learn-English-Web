"use client";

import type { QuestionSuggestionsFieldsFragment } from "@english/graphql";
import { useCallback, useEffect, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import {
  COMPLETION_LABEL,
  MATCHING_LABEL,
  parseGapText,
  questionFromPayload,
  TYPE_LABEL,
  type EditorQuestion,
  type PayloadQuestion,
} from "../lib/exercises";
import { Working } from "./working";

const letter = (i: number) => String.fromCharCode(65 + i);
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
const ANSWER: Record<string, string> = { TRUE: "True", FALSE: "False", NOT_GIVEN: "Not given", YES: "Yes", NO: "No" };

/** A drafted question as an editor checks it: what learners see, with the answer key marked. */
function QuestionCheck({ q }: { q: EditorQuestion }) {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const right = (i: number) => (q.type === "MULTIPLE_CHOICE" ? q.correct.includes(i) : q.correct === i);
      return (
        <>
          <p className="font-medium">
            {q.stem}
            {q.type === "MULTIPLE_CHOICE" ? <span className="text-muted"> (choose {q.correct.length})</span> : null}
          </p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {q.options.map((o, i) => (
              <li key={i} className={right(i) ? "font-semibold text-good" : "text-muted"}>
                {letter(i)}. {o} {right(i) ? "✓" : ""}
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "TRUE_FALSE_NOT_GIVEN":
    case "YES_NO_NOT_GIVEN":
      return (
        <p>
          <span className="font-medium">{q.statement}</span>{" "}
          <span className="font-semibold text-good">→ {ANSWER[q.answer]}</span>
        </p>
      );
    case "MATCHING": {
      // Paragraph letters are the options themselves; headings are numbered i, ii, iii as learners see them.
      const lettersOnly = q.variant === "INFORMATION";
      const mark = (i: number) => (q.variant === "HEADINGS" ? (ROMAN[i] ?? `${i + 1}`) : letter(i));
      const show = (i: number) => (lettersOnly ? (q.options[i] ?? "") : `${mark(i)} ${q.options[i] ?? ""}`);
      return (
        <>
          <p className="text-sm text-muted">
            {MATCHING_LABEL[q.variant]} · {lettersOnly ? "paragraphs" : "options"}:{" "}
            {q.options.map((_, i) => show(i)).join(" · ")}
          </p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {q.items.map((item, i) => (
              <li key={i}>
                {item} <span className="font-semibold text-good">→ {show(q.answers[i] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "COMPLETION":
    case "GAP_FILL": {
      const parsed = parseGapText(q.text);
      return (
        <>
          {q.type === "COMPLETION" ? (
            <p className="text-sm text-muted">
              {COMPLETION_LABEL[q.variant]} · no more than {q.wordLimit} word{q.wordLimit === 1 ? "" : "s"}
            </p>
          ) : null}
          <p>
            {typeof parsed === "string"
              ? q.text
              : parsed.segments.map((s, i) =>
                  "gapId" in s ? (
                    <span key={i} className="mx-0.5 rounded bg-good-soft px-1.5 font-semibold text-good">
                      {parsed.gaps.find((g) => g.gapId === s.gapId)?.accepted.join(" / ")}
                    </span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  )
                )}
          </p>
        </>
      );
    }
    case "SHORT_ANSWER":
      return (
        <p>
          <span className="font-medium">{q.question}</span>{" "}
          <span className="font-semibold text-good">→ {q.answers}</span>{" "}
          <span className="text-sm text-muted">(no more than {q.wordLimit} words)</span>
        </p>
      );
  }
}

/**
 * Questions the local AI drafted from the saved script, for an editor to check. Approve adds the ticked ones to the
 * lesson's exercises (a set per IELTS task type, with its instructions), where they can still be edited; Remove
 * drops them. Nothing reaches learners until it's approved and the lesson is published.
 */
export function QuestionSuggestions({
  resourceId,
  localizationId,
  lockVersion,
  editable,
  saved,
  hasScript,
  ensureSaved,
  paragraphs,
  data,
  onData: setData,
  onApproved,
}: {
  resourceId: string;
  localizationId: string;
  lockVersion: number;
  editable: boolean;
  saved: boolean;
  /** The script has text: suggestions need something to read. */
  hasScript: boolean;
  /** Saves the script first if it has unsaved changes; false when saving failed. */
  ensureSaved: () => Promise<boolean>;
  paragraphs: number;
  data: QuestionSuggestionsFieldsFragment;
  onData: (data: QuestionSuggestionsFieldsFragment) => void;
  onApproved: (message: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await actions.draftQuestionSuggestions(resourceId);
    if (r.ok) setData(r.suggestions);
  }, [resourceId, setData]);

  useEffect(() => {
    let live = true;
    void actions.draftQuestionSuggestions(resourceId).then((r) => {
      if (live && r.ok) setData(r.suggestions);
    });
    return () => {
      live = false;
    };
  }, [lockVersion, resourceId, setData]);

  useEffect(() => {
    if (data.state !== "WORKING") return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [data.state, refresh]);

  const open = data.items.filter((i) => i.status === "PENDING");
  const approved = data.items.filter((i) => i.status === "APPROVED").length;
  const removed = data.items.filter((i) => i.status === "REJECTED").length;
  const canAct = editable && saved && !pending;
  const picked = chosen.filter((id) => open.some((i) => i.id === id));

  function approve(ids: string[]) {
    start(async () => {
      const r = await actions.approveQuestions(localizationId, lockVersion, ids);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setChosen([]);
      onApproved(`Added ${ids.length} question(s) to the exercises.`);
    });
  }
  function remove(ids: string[]) {
    start(async () => {
      const r = await actions.rejectQuestions(localizationId, ids);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message ?? "Something went wrong." });
      setChosen([]);
      setMessage({ tone: "good", text: `Removed ${ids.length} question(s).` });
      await refresh();
    });
  }
  function again() {
    start(async () => {
      if (!(await ensureSaved())) return;
      const r = await actions.suggestQuestionsAgain(localizationId);
      setMessage(r.ok ? null : { tone: "bad", text: r.message ?? "Something went wrong." });
      await refresh();
    });
  }

  const button = "rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50";
  return (
    <section
      aria-labelledby="question-suggestions-heading"
      className="flex flex-col gap-3 rounded-2xl bg-good-soft/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="question-suggestions-heading" className="font-semibold">
          Suggested questions
        </h3>
        {editable && data.state !== "WORKING" ? (
          <button
            type="button"
            onClick={again}
            disabled={pending || !hasScript}
            title={hasScript ? undefined : "Write the script first"}
            className={
              data.state === "IDLE"
                ? `${button} bg-accent text-on-accent hover:bg-accent-strong`
                : `${button} border border-line bg-surface`
            }
          >
            {pending ? "Starting…" : data.state === "IDLE" ? "Suggest questions" : "Suggest again"}
          </button>
        ) : null}
      </div>

      {data.state === "WORKING" ? (
        <Working
          label="Writing IELTS-style questions about the script…"
          note={`The local AI reads the whole text and drafts a full set: about ${Math.max(1, paragraphs) + 1} minutes. You can keep working; the questions appear here to check.`}
        />
      ) : (
        <p className="text-sm text-muted" aria-live="polite">
          {data.state === "IDLE"
            ? hasScript
              ? "Click “Suggest questions” to draft IELTS-style questions about the script, for you to check."
              : "Write the script first: suggestions are made from it."
            : data.state === "FAILED"
              ? "The questions couldn't be drafted. Try “Suggest again”."
              : data.usedLanguageModel === false
                ? "The local AI wasn't running, so no questions could be drafted. Start it, then “Suggest again”."
                : open.length
                  ? `${open.length} to check · ${approved} added · ${removed} removed. Check every answer before approving.`
                  : `Nothing left to check · ${approved} added · ${removed} removed`}
        </p>
      )}
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
          <ol className="flex flex-col gap-2">
            {open.map((s, n) => {
              const q = questionFromPayload(s.question as PayloadQuestion);
              return (
                <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select question ${n + 1}`}
                    className="mt-1"
                    checked={chosen.includes(s.id)}
                    disabled={!canAct}
                    onChange={(e) =>
                      setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id))
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="self-start rounded-full bg-paper px-2 text-xs font-semibold text-muted">
                      {TYPE_LABEL[q.type]}
                    </span>
                    <QuestionCheck q={q} />
                    {q.explanation ? <p className="text-sm italic text-muted">{q.explanation}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`Approve question ${n + 1}`}
                      disabled={!canAct}
                      onClick={() => approve([s.id])}
                      className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove question ${n + 1}`}
                      disabled={!canAct}
                      onClick={() => remove([s.id])}
                      className={`${button} border border-line bg-surface hover:border-bad hover:text-bad`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      {message ? (
        <p className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
