import { blankQuestion, type CompletionVariant, type EditorQuestion, type EditorSet } from "./exercises";

/**
 * Reads a lesson's questions file (ADR 0012), laid out as IELTS Reading papers are:
 *
 *   Questions 1–4                       ← a group: its instructions say what type it is
 *   Which paragraph contains … A–G …    ← matching information (letters A–G; "more than once" → reusable)
 *   1  an example of …
 *   Questions 5–9 … TRUE … FALSE … NOT GIVEN    (or YES / NO / NOT GIVEN)
 *   Questions 10–13 Complete the summary … NO MORE THAN TWO WORDS …
 *   Reducing light pollution            ← a summary's heading
 *   … directed (10) ………… instead of …   ← gaps
 *   Questions 14–16 Choose the correct letter, A, B, C or D.  ← a question line, then lines "A …"
 *   Questions 17–19 Answer the questions below. NO MORE THAN THREE WORDS
 *
 *   ANSWER KEY
 *   1. F  (Paragraph F)                 ← the answer, and where it is
 *      the passage's words ↔ the question's words   ← the evidence
 *      → an explanation                 ← kept as written ("accept also “downward”" adds an accepted answer)
 *
 * Each group becomes an exercise set. Whatever can't be read is listed in `problems`.
 */
export type QuestionFile = { sets: EditorSet[]; problems: string[] };

type Answer = { answer: string; explanation: string; also: string[] };

const GROUP = /^Questions?\s+(\d+)(?:\s*(?:[–—-]|to|and)\s*(\d+))?\s*$/i;
const NUMBERED = /^(\d+)\s*[.):]?\s+(.+)$/;
const KEY = /^(?:answer key|answers|đáp án)\s*:?\s*$/i;
const WORDS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const DOTS = /[…·_]+|\.{3,}/;
/** A numbered gap, "(10) …………": the run of dots, not a full stop after it. */
const GAP = /\((\d+)\)\s*(?:[…·_]+|\.{3,})/g;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** The answer key: by question number, the answer, its explanation, and other accepted answers. */
function readKey(lines: string[]) {
  const key = new Map<number, Answer>();
  let current: { n: number; answer: string; where: string | null; notes: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    const notes = current.notes.join("\n");
    const also = [
      ...notes.matchAll(/(?:chấp nhận(?: cả)?|also accept(?:ed)?|accept)\s*[“"]([^”"]+)[”"]/giu),
      ...notes.matchAll(/spelling:\s*([\p{L}-]+)/giu),
    ].map((m) => tidy(m[1] ?? ""));
    key.set(current.n, {
      answer: current.answer,
      explanation: [current.where, notes].filter(Boolean).join("\n"),
      also: also.filter(Boolean),
    });
  };
  for (const line of lines) {
    const n = NUMBERED.exec(line);
    // A numbered line is the next answer (an evidence line may start with a number too: "400 songbirds…").
    if (n && Number(n[1]) > (current?.n ?? 0)) {
      finish();
      const [, number = "0", rest = ""] = n;
      const where = /\s*\(([^)]*)\)\s*$/.exec(rest);
      current = {
        n: Number(number),
        answer: tidy(where ? rest.slice(0, where.index) : rest),
        where: where ? tidy(where[1] ?? "") : null,
        notes: [],
      };
    } else if (current && !/^-{3,}$/.test(line)) {
      current.notes.push(tidy(line));
    }
  }
  finish();
  return key;
}

const wordLimit = (text: string) => {
  const m = /NO MORE THAN (ONE|TWO|THREE|FOUR|FIVE|\d+) WORDS?/i.exec(text) ?? /\b(ONE) WORD ONLY\b/i.exec(text);
  const w = (m?.[1] ?? "TWO").toUpperCase();
  return WORDS[w] ?? Number(w);
};

/** Explanations of several questions in one (matching, completion): "1. …" per question. */
const together = (numbers: number[], key: Map<number, Answer>) =>
  numbers
    .map((n) => key.get(n)?.explanation && `${n}. ${key.get(n)?.explanation}`)
    .filter(Boolean)
    .join("\n\n");

const accepted = (n: number, key: Map<number, Answer>) => {
  const a = key.get(n);
  return a ? [a.answer, ...a.also.filter((x) => x.toLowerCase() !== a.answer.toLowerCase())].join("|") : "";
};

function readGroup(from: number, to: number, lines: string[], key: Map<number, Answer>, problems: string[]) {
  const all = lines.join("\n");
  const title = from === to ? `Question ${from}` : `Questions ${from}–${to}`;
  const inRange = (n: number) => n >= from && n <= to;
  const numbered = lines.flatMap((l) => {
    const m = NUMBERED.exec(l);
    return m && inRange(Number(m[1])) ? [{ n: Number(m[1]), text: tidy(m[2] ?? ""), line: l }] : [];
  });
  const firstQuestion = numbered[0] ? lines.indexOf(numbered[0].line) : lines.length;
  const missing = (ns: number[]) => {
    for (const n of ns) if (!key.has(n)) problems.push(`Question ${n} has no answer in the answer key.`);
  };
  const instructionsUntil = (end: number) =>
    tidy(
      lines
        .slice(0, end)
        .filter((l) => !/^(TRUE|FALSE|NOT GIVEN|YES|NO)\s+if\b/i.test(l) && l.toLowerCase() !== "write")
        .join(" ")
    );

  // Which paragraph contains…: matching information.
  if (/which paragraph contains/i.test(all)) {
    const range = /\b([A-Z])\s*[–—-]\s*([A-Z])\b/.exec(all);
    const first = (range?.[1] ?? "A").charCodeAt(0);
    const last = (range?.[2] ?? "H").charCodeAt(0);
    const options = Array.from({ length: last - first + 1 }, (_, i) => String.fromCharCode(first + i));
    missing(numbered.map((q) => q.n));
    const question: EditorQuestion = {
      ...(blankQuestion("MATCHING") as Extract<EditorQuestion, { type: "MATCHING" }>),
      variant: "INFORMATION",
      items: numbered.map((q) => q.text),
      options,
      answers: numbered.map((q) => Math.max(0, options.indexOf((key.get(q.n)?.answer ?? "").toUpperCase().charAt(0)))),
      reuse: /more than once/i.test(all),
      explanation: together(
        numbered.map((q) => q.n),
        key
      ),
    };
    return { title, instructions: instructionsUntil(firstQuestion), questions: [question] };
  }

  // TRUE / FALSE / NOT GIVEN, or YES / NO / NOT GIVEN: one question per statement.
  const judged = /\bNOT GIVEN\b/.test(all) && (/\bTRUE\b/.test(all) || /\bYES\b/.test(all));
  if (judged) {
    const yesNo = /\bYES\b/.test(all) && !/\bTRUE\b/.test(all);
    missing(numbered.map((q) => q.n));
    const questions = numbered.map((q): EditorQuestion => {
      const given = (key.get(q.n)?.answer ?? "").toUpperCase().replace(/\s+/g, "_");
      const explanation = key.get(q.n)?.explanation ?? "";
      if (yesNo) {
        const answer = given === "NO" || given === "NOT_GIVEN" ? given : "YES";
        return {
          ...blankQuestion("YES_NO_NOT_GIVEN"),
          type: "YES_NO_NOT_GIVEN",
          statement: q.text,
          answer,
          explanation,
        };
      }
      const answer = given === "FALSE" || given === "NOT_GIVEN" ? given : "TRUE";
      return {
        ...blankQuestion("TRUE_FALSE_NOT_GIVEN"),
        type: "TRUE_FALSE_NOT_GIVEN",
        statement: q.text,
        answer,
        explanation,
      };
    });
    return { title, instructions: instructionsUntil(firstQuestion), questions };
  }

  // Complete the summary / sentences / notes: gaps "(10) …………", or numbered sentences with "……".
  const completion = /complete the (summary|sentences?|notes?|table|flow-?chart)/i.exec(all);
  if (completion) {
    const kind = (completion[1] ?? "").toLowerCase();
    const variant: CompletionVariant = kind.startsWith("summary")
      ? "SUMMARY"
      : kind.startsWith("sentence")
        ? "SENTENCE"
        : "NOTE";
    const gapLine = lines.findIndex((l) => /\(\d+\)\s*[….·_]/.test(l));
    const numbers: number[] = [];
    let text: string;
    let heading: string | null = null;
    let end: number;
    if (gapLine >= 0) {
      // A summary: a heading may come just before its text.
      const before = lines[gapLine - 1] ?? "";
      const hasHeading = gapLine > 0 && before.split(/\s+/).length <= 8 && !/[.:!?]$/.test(before);
      heading = hasHeading ? tidy(before) : null;
      end = hasHeading ? gapLine - 1 : gapLine;
      text = tidy(lines.slice(gapLine).join(" ")).replace(GAP, (_, n: string) => {
        numbers.push(Number(n));
        return `[${accepted(Number(n), key)}]`;
      });
    } else {
      end = firstQuestion;
      text = numbered
        .map((q) => {
          numbers.push(q.n);
          return DOTS.test(q.text)
            ? q.text.replace(DOTS, `[${accepted(q.n, key)}]`)
            : `${q.text} [${accepted(q.n, key)}]`;
        })
        .join("\n");
    }
    missing(numbers);
    const question: EditorQuestion = {
      ...(blankQuestion("COMPLETION") as Extract<EditorQuestion, { type: "COMPLETION" }>),
      variant,
      text,
      wordLimit: wordLimit(all),
      explanation: together(numbers, key),
    };
    return {
      title: heading ? `${title}: ${heading}` : title,
      instructions: instructionsUntil(end),
      questions: [question],
    };
  }

  // Choose the correct letter: a question line, then its options "A …".
  if (/choose the correct letter/i.test(all) && !/choose (two|three)/i.test(all)) {
    missing(numbered.map((q) => q.n));
    const questions = numbered.map((q): EditorQuestion => {
      const at = lines.indexOf(q.line);
      const options: string[] = [];
      for (const l of lines.slice(at + 1)) {
        const o = /^([A-H])[.)]?\s+(.+)$/.exec(l);
        if (!o || NUMBERED.test(l)) break;
        options.push(tidy(o[2] ?? ""));
      }
      const letter = (key.get(q.n)?.answer ?? "A").toUpperCase().charCodeAt(0) - 65;
      return {
        ...blankQuestion("SINGLE_CHOICE"),
        type: "SINGLE_CHOICE",
        stem: q.text,
        options,
        correct: Math.min(Math.max(letter, 0), Math.max(options.length - 1, 0)),
        explanation: key.get(q.n)?.explanation ?? "",
      };
    });
    return { title, instructions: instructionsUntil(firstQuestion), questions };
  }

  // Answer the questions below: short answers.
  if (/answer the questions?/i.test(all)) {
    missing(numbered.map((q) => q.n));
    const questions = numbered.map((q): EditorQuestion => ({
      ...blankQuestion("SHORT_ANSWER"),
      type: "SHORT_ANSWER",
      question: q.text,
      answers: accepted(q.n, key),
      wordLimit: wordLimit(all),
      explanation: key.get(q.n)?.explanation ?? "",
    }));
    return { title, instructions: instructionsUntil(firstQuestion), questions };
  }

  problems.push(`${title}: the question type couldn't be told from the instructions; add them by hand.`);
  return null;
}

export function parseQuestionFile(text: string): QuestionFile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const keyAt = lines.findIndex((l) => KEY.test(l));
  const key = readKey(keyAt >= 0 ? lines.slice(keyAt + 1) : []);
  const questionLines = keyAt >= 0 ? lines.slice(0, keyAt) : lines;
  const problems: string[] = [];
  if (keyAt < 0) problems.push("There's no ANSWER KEY: add the answers by hand.");
  const sets: EditorSet[] = [];
  let group: { from: number; to: number; lines: string[] } | null = null;
  const finish = () => {
    if (!group) return;
    const set = readGroup(group.from, group.to, group.lines, key, problems);
    if (set) sets.push(set);
  };
  for (const line of questionLines) {
    const g = GROUP.exec(line);
    if (g) {
      finish();
      group = { from: Number(g[1]), to: Number(g[2] ?? g[1]), lines: [] };
    } else if (group && !/^-{3,}$/.test(line)) {
      group.lines.push(line);
    }
  }
  finish();
  if (!sets.length && !problems.length) problems.push("No question groups found: start each with “Questions 1–4”.");
  return { sets, problems };
}
