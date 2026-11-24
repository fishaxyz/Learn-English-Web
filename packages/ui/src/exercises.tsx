"use client";

import type { ExerciseSetViewFragment, PracticeResultViewFragment } from "@english/graphql";
import { useState, type FormEvent } from "react";

type Question = ExerciseSetViewFragment["questions"][number];
type QuestionResult = PracticeResultViewFragment["questions"][number];

export type Answer = {
  questionId: string;
  optionId?: string;
  judgement?: "TRUE" | "FALSE" | "NOT_GIVEN";
  gaps?: { gapId: string; text: string }[];
};

export type GradeResult = { ok: true; result: PracticeResultViewFragment } | { ok: false; message: string };

const JUDGEMENTS = [
  ["TRUE", "True"],
  ["FALSE", "False"],
  ["NOT_GIVEN", "Not given"],
] as const;

/** Right or wrong, said in words and an icon (never by colour alone), with the explanation. */
export function AnswerFeedback({ question, result }: { question: Question; result: QuestionResult }) {
  let correctText: string | null = null;
  const answer = result.correctAnswer;
  if (answer.__typename === "ChoiceAnswer" && question.__typename === "SingleChoiceQuestion") {
    correctText = question.options.find((o) => o.id === answer.optionId)?.content ?? null;
  } else if (answer.__typename === "JudgementAnswer") {
    correctText = JUDGEMENTS.find(([v]) => v === answer.judgement)?.[1] ?? null;
  } else if (answer.__typename === "GapsAnswer") {
    correctText = answer.gaps.map((g) => g.text).join(", ");
  }
  return (
    <div
      role="status"
      className={`mt-2 rounded-lg px-3 py-2 text-sm ${result.correct ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}
    >
      <p className="font-semibold">
        <span aria-hidden="true">{result.correct ? "✓ " : "✗ "}</span>
        {result.correct ? "Correct" : `Not quite. The answer is: ${correctText ?? "see below"}`}
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
  if (question.__typename === "TrueFalseNotGivenQuestion") {
    return (
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 font-medium text-ink">
          {number}. {question.statement}
        </legend>
        <div className="flex flex-wrap gap-2">
          {JUDGEMENTS.map(([value, label]) => (
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
  // Gap fill: the sentence with a text box in each gap, numbered in order for screen readers.
  const gapNumbers = new Map(
    question.segments.flatMap((seg) => (seg.__typename === "GapSegment" ? [seg.gapId] : [])).map((id, i) => [id, i + 1])
  );
  const gaps = new Map((answer?.gaps ?? []).map((g) => [g.gapId, g.text]));
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Question {number}: fill in the gaps</legend>
      <p className="leading-loose text-ink">
        <span className="font-medium">{number}. </span>
        {question.segments.map((segment, i) => {
          if (segment.__typename === "TextSegment") return <span key={i}>{segment.text}</span>;
          const gapId = segment.gapId;
          return (
            <input
              key={i}
              type="text"
              aria-label={`Gap ${gapNumbers.get(gapId)}`}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              value={gaps.get(gapId) ?? ""}
              onChange={(e) => {
                const next = new Map(gaps).set(gapId, e.target.value);
                onChange({ questionId: question.id, gaps: [...next].map(([id, text]) => ({ gapId: id, text })) });
              }}
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
