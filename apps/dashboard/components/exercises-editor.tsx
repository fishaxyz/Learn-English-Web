"use client";

import { blankQuestion, type EditorQuestion, type EditorSet, type Judgement } from "../lib/exercises";

const field =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";

const TYPE_LABEL = {
  SINGLE_CHOICE: "Multiple choice",
  TRUE_FALSE_NOT_GIVEN: "True / False / Not given",
  GAP_FILL: "Fill the gap",
};

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
      {q.type === "SINGLE_CHOICE" ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-stem`}>
            Question
            <input
              id={`${id}-stem`}
              className={field}
              value={q.stem}
              onChange={(e) => onChange({ ...q, stem: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Choices (select the right one)</p>
            {q.options.map((option, o) => (
              <div key={o} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-correct`}
                  aria-label={`Choice ${o + 1} is correct`}
                  checked={q.correct === o}
                  onChange={() => onChange({ ...q, correct: o })}
                />
                <input
                  aria-label={`Choice ${o + 1}`}
                  className={field}
                  value={option}
                  onChange={(e) => onChange({ ...q, options: q.options.map((x, i) => (i === o ? e.target.value : x)) })}
                />
                {q.options.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`Remove choice ${o + 1}`}
                    className="text-sm text-muted hover:text-bad"
                    onClick={() =>
                      onChange({
                        ...q,
                        options: q.options.filter((_, i) => i !== o),
                        correct: q.correct > o ? q.correct - 1 : q.correct === o ? 0 : q.correct,
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {q.options.length < 8 ? (
              <button
                type="button"
                className="self-start text-sm font-medium text-accent hover:underline"
                onClick={() => onChange({ ...q, options: [...q.options, ""] })}
              >
                Add a choice
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {q.type === "TRUE_FALSE_NOT_GIVEN" ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-statement`}>
            Statement
            <input
              id={`${id}-statement`}
              className={field}
              value={q.statement}
              onChange={(e) => onChange({ ...q, statement: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-answer`}>
            Answer
            <select
              id={`${id}-answer`}
              className={`${field} w-auto`}
              value={q.answer}
              onChange={(e) => onChange({ ...q, answer: e.target.value as Judgement })}
            >
              <option value="TRUE">True</option>
              <option value="FALSE">False</option>
              <option value="NOT_GIVEN">Not given</option>
            </select>
          </label>
        </>
      ) : null}
      {q.type === "GAP_FILL" ? (
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-text`}>
          Sentence with gaps
          <input
            id={`${id}-text`}
            className={field}
            value={q.text}
            placeholder="Her commute takes about [forty|40] minutes."
            onChange={(e) => onChange({ ...q, text: e.target.value })}
          />
          <span className="font-normal text-muted">
            Put each gap&apos;s answer in square brackets. Separate other accepted answers with |, like [forty|40].
          </span>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-explanation`}>
        Explanation (shown after checking)
        <input
          id={`${id}-explanation`}
          className={field}
          value={q.explanation}
          onChange={(e) => onChange({ ...q, explanation: e.target.value })}
        />
      </label>
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
  return (
    <div className="flex flex-col gap-6">
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
