"use client";

import type { ExerciseSetViewFragment, PracticeResultViewFragment } from "@english/graphql";
import { useState, type FormEvent } from "react";

type Question = ExerciseSetViewFragment["questions"][number];
type QuestionResult = PracticeResultViewFragment["questions"][number];

export type Answer = {
  questionId: string;
  optionId?: string;
  optionIds?: string[];
  judgement?: "TRUE" | "FALSE" | "NOT_GIVEN" | "YES" | "NO";
  matches?: { itemId: string; optionId: string }[];
  gaps?: { gapId: string; text: string }[];
  text?: string;
};

export type GradeResult = { ok: true; result: PracticeResultViewFragment } | { ok: false; message: string };

const JUDGEMENTS = [
  ["TRUE", "True"],
  ["FALSE", "False"],
  ["NOT_GIVEN", "Not given"],
] as const;
const VIEWS = [
  ["YES", "Yes"],
  ["NO", "No"],
  ["NOT_GIVEN", "Not given"],
] as const;
const LABELS: Record<string, string> = { TRUE: "True", FALSE: "False", NOT_GIVEN: "Not given", YES: "Yes", NO: "No" };
/** Option letters as IELTS prints them: A, B, C... (headings use i, ii, iii...). */
const letter = (i: number) => String.fromCharCode(65 + i);
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
type Segments = { __typename?: string; text?: string; gapId?: string }[];

/** Right or wrong, said in words and an icon (never by colour alone), with the explanation. */
export function AnswerFeedback({ question, result }: { question: Question; result: QuestionResult }) {
  let correctText: string | null = null;
  const answer = result.correctAnswer;
  if (answer.__typename === "ChoiceAnswer" && question.__typename === "SingleChoiceQuestion") {
    correctText = question.options.find((o) => o.id === answer.optionId)?.content ?? null;
  } else if (answer.__typename === "JudgementAnswer") {
    correctText = LABELS[answer.judgement] ?? null;
  } else if (answer.__typename === "GapsAnswer") {
    correctText = answer.gaps.map((g) => g.text).join(", ");
  } else if (answer.__typename === "TextAnswer") {
    correctText = answer.text;
  } else if (answer.__typename === "ChoicesAnswer" && question.__typename === "MultipleChoiceQuestion") {
    correctText = question.options
      .flatMap((o, i) => (answer.optionIds.includes(o.id) ? [`${letter(i)} (${o.content})`] : []))
      .join(", ");
  } else if (answer.__typename === "MatchesAnswer" && question.__typename === "MatchingQuestion") {
    correctText = answer.matches
      .map((m) => {
        const item = question.items.find((it) => it.itemId === m.itemId)?.text ?? "";
        const o = question.options.findIndex((opt) => opt.id === m.optionId);
        return `${item}: ${question.matchingVariant === "HEADINGS" ? ROMAN[o] : letter(o)}`;
      })
      .join("; ");
  }
  return (
    <div
      role="status"
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${result.correct ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}
    >
      <p className="font-semibold">
        <span aria-hidden="true">{result.correct ? "✓ " : "✗ "}</span>
        {result.correct
          ? "Correct"
          : `${result.awardedPoints ? `${result.awardedPoints} of ${result.maxPoints} marks. ` : "Not quite. "}The answer is: ${correctText ?? "see below"}`}
      </p>
      {result.explanation ? <p className="mt-1 text-ink/80">{result.explanation}</p> : null}
    </div>
  );
}

function QuestionField({
  question,
  number,
  answer,
  onChange,
  disabled,
}: {
  question: Question;
  number: number;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  disabled: boolean;
}) {
  const name = `q-${question.id}`;
  if (question.__typename === "SingleChoiceQuestion") {
    return (
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 font-medium text-ink">
          {number}. {question.stem}
        </legend>
        {question.options.map((o) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 hover:bg-accent-soft/40"
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={answer?.optionId === o.id}
              onChange={() => onChange({ questionId: question.id, optionId: o.id })}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span>{o.content}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.__typename === "TrueFalseNotGivenQuestion" || question.__typename === "YesNoNotGivenQuestion") {
    const choices = question.__typename === "TrueFalseNotGivenQuestion" ? JUDGEMENTS : VIEWS;
    return (
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 font-medium text-ink">
          {number}. {question.statement}
        </legend>
        <div className="flex flex-wrap gap-2">
          {choices.map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={answer?.judgement === value}
                onChange={() => onChange({ questionId: question.id, judgement: value })}
                className="accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (question.__typename === "MultipleChoiceQuestion") {
    const chosen = answer?.optionIds ?? [];
    return (
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 font-medium text-ink">
          {number}. {question.stem}{" "}
          <span className="text-sm font-normal text-muted">(Choose {question.choose} letters.)</span>
        </legend>
        {question.options.map((o, i) => {
          const on = chosen.includes(o.id);
          return (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 hover:bg-accent-soft/40"
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!on && chosen.length >= question.choose}
                onChange={() =>
                  onChange({
                    questionId: question.id,
                    optionIds: on ? chosen.filter((id) => id !== o.id) : [...chosen, o.id],
                  })
                }
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span>
                <span className="font-semibold">{letter(i)}</span> {o.content}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (question.__typename === "MatchingQuestion") {
    const headings = question.matchingVariant === "HEADINGS";
    const mark = (i: number) => (headings ? ROMAN[i] : letter(i));
    const chosen = new Map((answer?.matches ?? []).map((m) => [m.itemId, m.optionId]));
    return (
      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 font-medium text-ink">{number}. Match each item to an option.</legend>
        <ol className="flex flex-col gap-1 rounded-lg bg-accent-soft/30 p-3 text-sm">
          {question.options.map((o, i) => (
            <li key={o.id}>
              <span className="font-semibold">{mark(i)}</span> {o.content}
            </li>
          ))}
        </ol>
        {question.items.map((item) => (
          <label key={item.itemId} className="flex flex-wrap items-center gap-2">
            <span className="flex-1">{item.text}</span>
            <select
              value={chosen.get(item.itemId) ?? ""}
              onChange={(e) => {
                const next = new Map(chosen).set(item.itemId, e.target.value);
                onChange({
                  questionId: question.id,
                  matches: [...next].filter(([, id]) => id).map(([itemId, optionId]) => ({ itemId, optionId })),
                });
              }}
              className="rounded-md border border-line bg-surface px-2 py-1"
            >
              <option value="">Choose</option>
              {question.options.map((o, i) => (
                <option key={o.id} value={o.id}>
                  {mark(i)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.__typename === "ShortAnswerQuestion") {
    return (
      <label className="flex flex-col gap-2">
        <span className="font-medium text-ink">
          {number}. {question.question}{" "}
          <span className="text-sm font-normal text-muted">(No more than {question.wordLimit} words.)</span>
        </span>
        <input
          type="text"
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          value={answer?.text ?? ""}
          onChange={(e) => onChange({ questionId: question.id, text: e.target.value })}
          className="max-w-md rounded-md border border-line bg-surface px-3 py-1.5"
        />
      </label>
    );
  }
  // Gap fill and completion: the text with a box (or a word-box choice) in each gap.
  const segments = question.segments as Segments;
  const wordBox = question.__typename === "CompletionQuestion" ? question.wordBox : null;
  const limit = question.__typename === "CompletionQuestion" ? question.wordLimit : null;
  const gapNumbers = new Map(segments.flatMap((seg) => (seg.gapId ? [seg.gapId] : [])).map((id, i) => [id, i + 1]));
  const gaps = new Map((answer?.gaps ?? []).map((g) => [g.gapId, g.text]));
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Question {number}: fill in the gaps</legend>
      {limit ? (
        <p className="mb-1 text-sm text-muted">
          No more than {limit} word{limit === 1 ? "" : "s"} for each answer.
        </p>
      ) : null}
      {wordBox ? (
        <p className="mb-2 flex flex-wrap gap-1.5 text-sm">
          {wordBox.map((w) => (
            <span key={w} className="rounded-md border border-line px-2 py-0.5">
              {w}
            </span>
          ))}
        </p>
      ) : null}
      <p className="leading-loose text-ink">
        <span className="font-medium">{number}. </span>
        {segments.map((segment, i) => {
          if (!segment.gapId) return <span key={i}>{segment.text}</span>;
          const gapId = segment.gapId;
          const set = (text: string) => {
            const next = new Map(gaps).set(gapId, text);
            onChange({ questionId: question.id, gaps: [...next].map(([id, t]) => ({ gapId: id, text: t })) });
          };
          if (wordBox) {
            return (
              <select
                key={i}
                aria-label={`Gap ${gapNumbers.get(gapId)}`}
                value={gaps.get(gapId) ?? ""}
                onChange={(e) => set(e.target.value)}
                className="mx-1 rounded-md border-b-2 border-accent bg-accent-soft/40 px-2 py-0.5"
              >
                <option value="">…</option>
                {wordBox.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={i}
              type="text"
              aria-label={`Gap ${gapNumbers.get(gapId)}`}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              value={gaps.get(gapId) ?? ""}
              onChange={(e) => set(e.target.value)}
              className="mx-1 w-32 rounded-md border-b-2 border-accent bg-accent-soft/40 px-2 py-0.5 text-center focus-visible:outline-2 focus-visible:outline-accent"
            />
          );
        })}
      </p>
    </fieldset>
  );
}

/**
 * A set of exercises. Answers are checked on the server (`grade`), which returns the score and, for each
 * question, whether it was right and why; the correct answers never reach the browser before that.
 * Without `grade` (an editor's preview), the questions show but can't be checked.
 */
export function ExerciseRenderer({
  set,
  grade,
}: {
  set: ExerciseSetViewFragment;
  grade?: (exerciseSetId: string, answers: Answer[]) => Promise<GradeResult>;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<PracticeResultViewFragment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byQuestion = new Map(result?.questions.map((q) => [q.questionId, q]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!grade) return;
    setBusy(true);
    setError(null);
    const graded = await grade(set.id, Object.values(answers));
    setBusy(false);
    if (graded.ok) setResult(graded.result);
    else setError(graded.message);
  }

  return (
    <section aria-labelledby={`set-${set.id}`} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id={`set-${set.id}`} className="font-display text-2xl font-semibold text-ink">
        {set.title}
      </h2>
      {set.instructions ? <p className="mt-1 text-muted">{set.instructions}</p> : null}
      <form onSubmit={submit} className="mt-5 flex flex-col gap-6">
        {set.questions.map((q, i) => {
          const r = byQuestion.get(q.id);
          return (
            <div key={q.id}>
              <QuestionField
                question={q}
                number={i + 1}
                answer={answers[q.id]}
                onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
                disabled={busy || result !== null}
              />
              {r ? <AnswerFeedback question={q} result={r} /> : null}
            </div>
          );
        })}
        {error ? (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          {result ? (
            <>
              <p className="text-lg font-semibold text-ink" role="status">
                You scored {result.score} out of {result.maxScore}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setAnswers({});
                }}
                className="rounded-full border border-line px-5 py-2 font-medium text-ink hover:border-accent"
              >
                Try again
              </button>
            </>
          ) : grade ? (
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-accent px-6 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Checking…" : "Check answers"}
            </button>
          ) : (
            <p className="text-sm text-muted">Preview: answers can be checked once the lesson is published.</p>
          )}
        </div>
      </form>
    </section>
  );
}
