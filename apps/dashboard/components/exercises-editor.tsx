"use client";

import {
  blankQuestion,
  COMPLETION_LABEL,
  MATCHING_LABEL,
  TYPE_LABEL,
  type CompletionVariant,
  type EditorQuestion,
  type EditorSet,
  type Judgement,
  type MatchingVariant,
  type View,
} from "../lib/exercises";
import { useId, useState } from "react";
import { ListFileError, readListFile } from "../lib/list-file";
import { parseQuestionFile } from "../lib/question-file";

const field =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";
const smallLink = "self-start text-sm font-medium text-accent hover:underline";
const letter = (i: number) => String.fromCharCode(65 + i);

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  /** Several lines (a textarea), for texts that keep their line breaks. */
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={id}>
      {label}
      {rows ? (
        <textarea
          id={id}
          className={field}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className={field}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {help ? <span className="font-normal text-muted">{help}</span> : null}
    </label>
  );
}

/** A list of short texts (options, items) that can grow and shrink. */
function ListField({
  label,
  values,
  min,
  max,
  mark,
  onChange,
  renderExtra,
  onRemove,
}: {
  label: string;
  values: string[];
  min: number;
  max: number;
  mark: (i: number) => string;
  onChange: (values: string[]) => void;
  renderExtra?: (i: number) => React.ReactNode;
  onRemove?: (i: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          {renderExtra ? renderExtra(i) : null}
          <span className="w-6 text-sm font-semibold text-muted">{mark(i)}</span>
          <input
            aria-label={`${label} ${mark(i)}`}
            className={field}
            value={value}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {values.length > min ? (
            <button
              type="button"
              aria-label={`Remove ${mark(i)}`}
              className="text-sm text-muted hover:text-bad"
              onClick={() => (onRemove ? onRemove(i) : onChange(values.filter((_, j) => j !== i)))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {values.length < max ? (
        <button type="button" className={smallLink} onClick={() => onChange([...values, ""])}>
          Add
        </button>
      ) : null}
    </div>
  );
}

function JudgementField<T extends string>({
  id,
  value,
  choices,
  onChange,
}: {
  id: string;
  value: T;
  choices: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium" htmlFor={id}>
      Answer
      <select id={id} className={`${field} w-auto`} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {choices.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

const GAP_HELP = "Put each gap's answer in square brackets. Separate other accepted answers with |, like [forty|40].";

/** The fields for one question, by type. */
export function QuestionFields({
  q,
  id,
  onChange,
}: {
  q: EditorQuestion;
  id: string;
  onChange: (q: EditorQuestion) => void;
}) {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const many = q.type === "MULTIPLE_CHOICE";
      const isRight = (i: number) => (many ? q.correct.includes(i) : q.correct === i);
      return (
        <>
          <TextField id={`${id}-stem`} label="Question" value={q.stem} onChange={(stem) => onChange({ ...q, stem })} />
          <ListField
            label={
              many ? "Choices (tick every correct one; learners choose that many)" : "Choices (select the right one)"
            }
            values={q.options}
            min={many ? 3 : 2}
            max={10}
            mark={letter}
            onChange={(options) => onChange({ ...q, options })}
            onRemove={(o) =>
              many
                ? onChange({
                    ...q,
                    options: q.options.filter((_, i) => i !== o),
                    correct: q.correct.filter((c) => c !== o).map((c) => (c > o ? c - 1 : c)),
                  })
                : onChange({
                    ...q,
                    options: q.options.filter((_, i) => i !== o),
                    correct: q.correct > o ? q.correct - 1 : q.correct === o ? 0 : q.correct,
                  })
            }
            renderExtra={(o) => (
              <input
                type={many ? "checkbox" : "radio"}
                name={`${id}-correct`}
                aria-label={`Choice ${letter(o)} is correct`}
                checked={isRight(o)}
                onChange={() =>
                  many
                    ? onChange({ ...q, correct: isRight(o) ? q.correct.filter((c) => c !== o) : [...q.correct, o] })
                    : onChange({ ...q, correct: o })
                }
              />
            )}
          />
        </>
      );
    }
    case "TRUE_FALSE_NOT_GIVEN":
      return (
        <>
          <TextField
            id={`${id}-statement`}
            label="Statement"
            value={q.statement}
            onChange={(statement) => onChange({ ...q, statement })}
          />
          <JudgementField<Judgement>
            id={`${id}-answer`}
            value={q.answer}
            choices={[
              ["TRUE", "True"],
              ["FALSE", "False"],
              ["NOT_GIVEN", "Not given"],
            ]}
            onChange={(answer) => onChange({ ...q, answer })}
          />
        </>
      );
    case "YES_NO_NOT_GIVEN":
      return (
        <>
          <TextField
            id={`${id}-statement`}
            label="Statement about the writer's views"
            value={q.statement}
            onChange={(statement) => onChange({ ...q, statement })}
          />
          <JudgementField<View>
            id={`${id}-answer`}
            value={q.answer}
            choices={[
              ["YES", "Yes"],
              ["NO", "No"],
              ["NOT_GIVEN", "Not given"],
            ]}
            onChange={(answer) => onChange({ ...q, answer })}
          />
        </>
      );
    case "MATCHING": {
      const optionMark = (i: number) =>
        q.variant === "HEADINGS"
          ? (["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][i] ?? `${i + 1}`)
          : letter(i);
      return (
        <>
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-variant`}>
            Kind
            <select
              id={`${id}-variant`}
              className={`${field} w-auto`}
              value={q.variant}
              onChange={(e) => onChange({ ...q, variant: e.target.value as MatchingVariant })}
            >
              {(Object.keys(MATCHING_LABEL) as MatchingVariant[]).map((v) => (
                <option key={v} value={v}>
                  {MATCHING_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
          <ListField
            label={q.variant === "HEADINGS" ? "Headings" : q.variant === "INFORMATION" ? "Paragraphs" : "Options"}
            values={q.options}
            min={2}
            max={20}
            mark={optionMark}
            onChange={(options) =>
              onChange({ ...q, options, answers: q.answers.map((a) => Math.min(a, options.length - 1)) })
            }
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {q.variant === "HEADINGS"
                ? "Paragraphs"
                : q.variant === "SENTENCE_ENDINGS"
                  ? "Sentence beginnings"
                  : "Statements"}{" "}
              and their answers
            </p>
            {q.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label={`Item ${i + 1}`}
                  className={field}
                  value={item}
                  onChange={(e) => onChange({ ...q, items: q.items.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <select
                  aria-label={`Answer for item ${i + 1}`}
                  className={`${field} w-auto`}
                  value={q.answers[i] ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...q,
                      answers: q.items.map((_, j) => (j === i ? Number(e.target.value) : (q.answers[j] ?? 0))),
                    })
                  }
                >
                  {q.options.map((o, k) => (
                    <option key={k} value={k}>
                      {optionMark(k)} {o.slice(0, 30)}
                    </option>
                  ))}
                </select>
                {q.items.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove item ${i + 1}`}
                    className="text-sm text-muted hover:text-bad"
                    onClick={() =>
                      onChange({
                        ...q,
                        items: q.items.filter((_, j) => j !== i),
                        answers: q.answers.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className={smallLink}
              onClick={() => onChange({ ...q, items: [...q.items, ""], answers: [...q.answers, 0] })}
            >
              Add an item
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={q.reuse} onChange={(e) => onChange({ ...q, reuse: e.target.checked })} />
            An option may be the answer more than once
          </label>
        </>
      );
    }
    case "COMPLETION":
      return (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-variant`}>
              Kind
              <select
                id={`${id}-variant`}
                className={`${field} w-auto`}
                value={q.variant}
                onChange={(e) => onChange({ ...q, variant: e.target.value as CompletionVariant })}
              >
                {(Object.keys(COMPLETION_LABEL) as CompletionVariant[]).map((v) => (
                  <option key={v} value={v}>
                    {COMPLETION_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-limit`}>
              No more than
              <select
                id={`${id}-limit`}
                className={`${field} w-auto`}
                value={q.wordLimit}
                onChange={(e) => onChange({ ...q, wordLimit: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} word{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-text`}>
            Text with gaps
            <textarea
              id={`${id}-text`}
              rows={q.variant === "SENTENCE" ? 1 : 4}
              className={field}
              value={q.text}
              placeholder="Mia cycles along the [river] to the station."
              onChange={(e) => onChange({ ...q, text: e.target.value })}
            />
            <span className="font-normal text-muted">{GAP_HELP}</span>
          </label>
          <TextField
            id={`${id}-box`}
            label="Word box (optional)"
            value={q.wordBox}
            placeholder="river, road, park, station"
            help="Words separated by commas: learners choose each answer from these instead of typing."
            onChange={(wordBox) => onChange({ ...q, wordBox })}
          />
        </>
      );
    case "SHORT_ANSWER":
      return (
        <>
          <TextField
            id={`${id}-question`}
            label="Question"
            value={q.question}
            onChange={(question) => onChange({ ...q, question })}
          />
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-60 flex-1">
              <TextField
                id={`${id}-answers`}
                label="Accepted answers"
                value={q.answers}
                placeholder="forty minutes | 40 minutes"
                help="Separate accepted answers with |."
                onChange={(answers) => onChange({ ...q, answers })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-limit`}>
              No more than
              <select
                id={`${id}-limit`}
                className={`${field} w-auto`}
                value={q.wordLimit}
                onChange={(e) => onChange({ ...q, wordLimit: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} word{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      );
    case "GAP_FILL":
      return (
        <TextField
          id={`${id}-text`}
          label="Sentence with gaps"
          value={q.text}
          placeholder="Her commute takes about [forty|40] minutes."
          help={GAP_HELP}
          onChange={(text) => onChange({ ...q, text })}
        />
      );
  }
}

function QuestionEditor({
  q,
  id,
  disabled,
  onChange,
  onRemove,
}: {
  q: EditorQuestion;
  id: string;
  disabled: boolean;
  onChange: (q: EditorQuestion) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-muted">{TYPE_LABEL[q.type]}</legend>
      <QuestionFields q={q} id={id} onChange={onChange} />
      <TextField
        id={`${id}-explanation`}
        label="Explanation (shown after checking)"
        rows={q.explanation.includes("\n") ? 4 : 1}
        value={q.explanation}
        onChange={(explanation) => onChange({ ...q, explanation })}
      />
      <button type="button" onClick={onRemove} className="self-start text-sm text-muted hover:text-bad">
        Remove question
      </button>
    </fieldset>
  );
}

/** Sets of questions with their answers. Saved separately from the text; the API validates them whole. */
export function ExercisesEditor({
  sets,
  disabled,
  onChange,
}: {
  sets: EditorSet[];
  disabled: boolean;
  onChange: (sets: EditorSet[]) => void;
}) {
  const update = (s: number, set: EditorSet) => onChange(sets.map((x, i) => (i === s ? set : x)));
  const [fileMessage, setFileMessage] = useState<{ tone: "good" | "bad"; text: string; problems: string[] } | null>(
    null
  );
  const fileId = useId();

  /** A questions file (IELTS layout, with its answer key) replaces the sets; the editor checks, then saves. */
  async function pickQuestions(file: File | undefined) {
    if (!file) return;
    try {
      const read = parseQuestionFile(await readListFile(file));
      if (!read.sets.length) {
        return setFileMessage({ tone: "bad", text: `No questions found in “${file.name}”.`, problems: read.problems });
      }
      if (
        sets.length &&
        !window.confirm(`Replace the ${sets.length} exercise sets here with those of “${file.name}”?`)
      ) {
        return;
      }
      onChange(read.sets);
      const count = read.sets.reduce(
        (n, set) =>
          n +
          set.questions.reduce(
            (m, q) =>
              m +
              (q.type === "MATCHING"
                ? q.items.length
                : q.type === "COMPLETION"
                  ? (q.text.match(/\[/g) ?? []).length
                  : 1),
            0
          ),
        0
      );
      setFileMessage({
        tone: read.problems.length ? "bad" : "good",
        text: `Read ${count} questions in ${read.sets.length} sets from “${file.name}”. Check them, then save.`,
        problems: read.problems,
      });
    } catch (error) {
      setFileMessage({
        tone: "bad",
        text: error instanceof ListFileError ? error.message : "That file couldn't be read.",
        problems: [],
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!disabled ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={fileId}
              className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-accent"
            >
              Choose a questions file (.txt or .docx)
            </label>
            <input
              id={fileId}
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                void pickQuestions(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="text-sm text-muted">
              IELTS layout: “Questions 1–4”, the questions, then the ANSWER KEY.
            </span>
          </div>
          {fileMessage ? (
            <div role="status" className={`text-sm ${fileMessage.tone === "bad" ? "text-bad" : "text-good"}`}>
              <p>{fileMessage.text}</p>
              {fileMessage.problems.length ? (
                <ul className="list-disc pl-5">
                  {fileMessage.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {sets.map((set, s) => (
        <section
          key={s}
          aria-label={`Exercise set ${s + 1}`}
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`set-${s}-title`}>
              Set title
              <input
                id={`set-${s}-title`}
                disabled={disabled}
                className={field}
                value={set.title}
                onChange={(e) => update(s, { ...set, title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`set-${s}-instructions`}>
              Instructions
              <input
                id={`set-${s}-instructions`}
                disabled={disabled}
                className={field}
                value={set.instructions}
                onChange={(e) => update(s, { ...set, instructions: e.target.value })}
              />
            </label>
          </div>
          {set.questions.map((q, i) => (
            <QuestionEditor
              key={i}
              q={q}
              id={`set-${s}-q-${i}`}
              disabled={disabled}
              onChange={(next) => update(s, { ...set, questions: set.questions.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => update(s, { ...set, questions: set.questions.filter((_, j) => j !== i) })}
            />
          ))}
          {!disabled ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Add a question:</span>
              {(Object.keys(TYPE_LABEL) as EditorQuestion["type"][]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update(s, { ...set, questions: [...set.questions, blankQuestion(type)] })}
                  className="rounded-full border border-line px-3 py-1 hover:border-accent"
                >
                  {TYPE_LABEL[type]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange(sets.filter((_, i) => i !== s))}
                className="ml-auto text-muted hover:text-bad"
              >
                Remove set
              </button>
            </div>
          ) : null}
        </section>
      ))}
      {!disabled ? (
        <button
          type="button"
          onClick={() => onChange([...sets, { title: "Check your understanding", instructions: "", questions: [] }])}
          className="self-start rounded-full border border-dashed border-line px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Add an exercise set
        </button>
      ) : null}
    </div>
  );
}
