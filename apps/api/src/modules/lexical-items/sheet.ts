import type { schema } from "@english/database";

/**
 * Reads an editor's vocabulary sheet (ADR 0011): the explanations are the editor's own, kept as written. The sheet is
 * forgiving about layout; what it understands:
 *
 *   A. Vocabulary                      ← a section sets the kind (Vocabulary, Phrases & collocations, Idioms,
 *                                        Structures, Paraphrase pairs, Phrasal verbs)
 *   1. disrupt (v) /dɪsˈrʌpt/ – làm gián đoạn
 *                                      ← a numbered line starts an item: its words, part of speech, pronunciation and,
 *                                        after a spaced dash, its meaning in the sheet's language
 *   to stop something from continuing  ← the first plain line: the English definition
 *   Usage: disrupt + a cycle/routine   ← labelled lines: Usage, Use, Example, Synonyms, Note
 *   Example: …                         ← plain lines after an example are more examples
 *   → Tuy nhiên, …                     ← an arrow line translates the line above it
 *   Synonyms:
 *     interrupt – neutral, … (làm gián đoạn tạm thời)
 *                                      ← one per line: the words, a note on when to use it, a translation in brackets
 *   Note: ❌ obstacle for → ✅ obstacle to
 *   25. words in the text ↔ words in the question – meaning (Q2)
 *                                      ← a paraphrase pair, with the question it belongs to
 *
 * A sheet without numbered lines is read as a plain list: one item per line, a meaning after a spaced dash.
 */
export type LexicalItemKind = (typeof schema.LEXICAL_ITEM_KINDS)[number];

/** The parts of an item in the sheet's own language (the learner's native language). */
export type SheetLanguagePart = {
  meaning: string | null;
  definition: string | null;
  notes: { text: string; translation: string | null }[];
};

export type SheetItem = {
  text: string;
  kind: LexicalItemKind;
  partOfSpeech: string | null;
  pronunciation: string | null;
  definition: string | null;
  usage: string | null;
  examples: { text: string; translation: string | null }[];
  synonyms: { text: string; note: string | null; translation: string | null }[];
  pairedWith: string | null;
  question: string | null;
  language: SheetLanguagePart;
};

export const SHEET_LIMIT = { text: 200, field: 1000, list: 20 };

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
export const keyOf = (s: string) => tidy(s).toLowerCase();
const clip = (s: string | null | undefined, max = SHEET_LIMIT.field) => {
  const t = tidy(s ?? "");
  return t ? t.slice(0, max) : null;
};

const DASH = /\s+[–—-]\s+/;
const PAIR = /\s*(?:↔|⇔|<->|<=>)\s*/;
const ARROW = /^(?:→|->|=>|⇒)\s*/;
const NUMBERED = /^\d{1,3}\s*[.)]\s+(.+)$/;
const SECTION = /^(?:[A-Z][.)]|#{1,3})\s+(.+)$/;
const LABEL = /^(usage|how to use|use|examples?|e\.g\.|eg|synonyms?|notes?)\s*:\s*(.*)$/i;
const QUESTION = /\s*\(((?:Q|Question|Câu)\s*\d+[^)]*)\)\s*$/i;
const PRONUNCIATION = /\/[^/\s][^/]*\//;
const TRAILING_BRACKETS = /\s*\(([^()]+)\)\s*$/;

/** Section names (in English or Vietnamese) and the kind they set; the first match wins. */
const SECTIONS: [RegExp, LexicalItemKind][] = [
  [/phrasal verb/i, "PHRASAL_VERB"],
  [/paraphrase/i, "PARAPHRASE"],
  [/idiom|thành ngữ/i, "IDIOM"],
  [/structure|grammar|cấu trúc/i, "STRUCTURE"],
  [/phrase|collocation|cụm từ/i, "COLLOCATION"],
  [/vocabulary|keyword|từ vựng/i, "KEYWORD"],
];
const sectionKind = (name: string) => SECTIONS.find(([re]) => re.test(name))?.[1] ?? null;

/** Parts of speech written in brackets after the words, e.g. "(v)", "(phr v)", "(idiom)". */
const PARTS_OF_SPEECH = new Set([
  "v",
  "n",
  "adj",
  "adv",
  "prep",
  "conj",
  "pron",
  "det",
  "phr",
  "phr v",
  "phrasal verb",
  "phrase",
  "idiom",
  "collocation",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "n phr",
  "expr",
  "expression",
  "structure",
]);
const POS_KIND: Record<string, LexicalItemKind> = {
  "phr v": "PHRASAL_VERB",
  "phrasal verb": "PHRASAL_VERB",
  idiom: "IDIOM",
};
const POS_FALLBACK: Record<string, LexicalItemKind> = {
  phr: "COLLOCATION",
  phrase: "COLLOCATION",
  collocation: "COLLOCATION",
  "n phr": "COLLOCATION",
  structure: "STRUCTURE",
};

/** "neutral, formal (trang trọng)" → the text and the bracketed translation. */
function splitTranslation(s: string): [string, string | null] {
  const m = TRAILING_BRACKETS.exec(s);
  if (!m || m.index === 0) return [s, null];
  return [s.slice(0, m.index), m[1] ?? null];
}

/** An item's first line: its words, part of speech, pronunciation, meaning, and a paraphrase's other side. */
function header(line: string, section: LexicalItemKind | null): SheetItem | null {
  const [first = "", ...rest] = line.split(DASH);
  let head = first;
  let meaning = rest.join(" – ");
  let question: string | null = null;
  for (const part of ["meaning", "head"] as const) {
    const text = part === "meaning" ? meaning : head;
    const q = QUESTION.exec(text);
    if (!q || question) continue;
    question = tidy(q[1] ?? "");
    if (part === "meaning") meaning = text.slice(0, q.index);
    else head = text.slice(0, q.index);
  }
  const [left = "", right] = head.split(PAIR);
  let words = left;
  const pronunciation = PRONUNCIATION.exec(words)?.[0] ?? null;
  if (pronunciation) words = words.replace(pronunciation, " ");
  let partOfSpeech: string | null = null;
  words = words.replace(/\(([^()]{1,15})\)/g, (all, inner: string) => {
    const pos = inner.toLowerCase().replace(/\./g, "").trim();
    if (partOfSpeech || !PARTS_OF_SPEECH.has(pos)) return all;
    partOfSpeech = pos;
    return " ";
  });
  const text = clip(words, SHEET_LIMIT.text);
  if (!text) return null;
  const pos = partOfSpeech as string | null;
  const kind: LexicalItemKind =
    right !== undefined
      ? "PARAPHRASE"
      : ((pos ? POS_KIND[pos] : undefined) ??
        section ??
        (pos ? POS_FALLBACK[pos] : undefined) ??
        (/\s\+\s/.test(text) ? "STRUCTURE" : "KEYWORD"));
  return {
    text,
    kind,
    partOfSpeech: pos,
    pronunciation,
    definition: null,
    usage: null,
    examples: [],
    synonyms: [],
    pairedWith: clip(right),
    question,
    language: { meaning: clip(meaning), definition: null, notes: [] },
  };
}

function synonym(line: string) {
  const [words = "", ...rest] = line.split(DASH);
  const [note, translation] = rest.length ? splitTranslation(rest.join(" – ")) : ["", null];
  const text = clip(words, SHEET_LIMIT.text);
  return text ? { text, note: clip(note), translation: clip(translation) } : null;
}

type Context = "start" | "definition" | "usage" | "example" | "synonyms" | "note";

/** Reads the sheet's items in order. Items repeated (same words, any case) count once: the first is kept. */
export function parseSheet(sheet: string): SheetItem[] {
  const lines = sheet.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•·]\s+/, "").trim());
  const numbered = lines.some((l) => NUMBERED.test(l));
  const items: SheetItem[] = [];
  let section: LexicalItemKind | null = null;
  let item: SheetItem | null = null;
  let context: Context = "start";
  // Where an arrow line's translation goes: the line it translates.
  let translate: ((t: string) => void) | null = null;
  let blankBefore = true;

  const begin = (line: string) => {
    const started = header(line, section);
    item = started;
    if (started) items.push(started);
    context = "start";
    translate = started
      ? (t) => {
          started.language.meaning ??= clip(t);
        }
      : null;
  };

  for (const line of lines) {
    if (!line) {
      blankBefore = true;
      continue;
    }
    const wasBlank = blankBefore;
    blankBefore = false;
    const sectionLine = SECTION.exec(line);
    const bareHeading = !DASH.test(line) && line.split(/\s+/).length <= 4 && (wasBlank || !item) && !LABEL.test(line);
    if ((sectionLine && sectionKind(sectionLine[1] ?? "")) || (bareHeading && sectionKind(line))) {
      section = sectionKind(sectionLine?.[1] ?? line);
      item = null;
      translate = null;
      continue;
    }
    const n = NUMBERED.exec(line);
    if (n || !numbered) {
      begin(n?.[1] ?? line);
      continue;
    }
    const current = item as SheetItem | null;
    if (!current) continue;
    if (ARROW.test(line)) {
      translate?.(line.replace(ARROW, ""));
      translate = null;
      continue;
    }
    const label = LABEL.exec(line);
    const name = label?.[1]?.toLowerCase();
    const value = tidy(label?.[2] ?? line);
    const addExample = (text: string) => {
      const example = { text, translation: null as string | null };
      current.examples.push(example);
      translate = (t) => (example.translation = clip(t));
    };
    const addNote = (text: string) => {
      const note = { text, translation: null as string | null };
      current.language.notes.push(note);
      translate = (t) => (note.translation = clip(t));
    };
    if (name === "usage" || name === "how to use") {
      current.usage = clip([current.usage, value].filter(Boolean).join("; "));
      context = "usage";
      translate = null;
    } else if (name === "use") {
      const [english, translation] = splitTranslation(value);
      current.definition ??= clip(english);
      current.language.definition ??= clip(translation);
      context = "definition";
      translate = (t) => (current.language.definition ??= clip(t));
    } else if (name?.startsWith("example") || name === "eg" || name === "e.g.") {
      if (value) addExample(value);
      context = "example";
    } else if (name?.startsWith("synonym")) {
      const list = DASH.test(value) ? [value] : value.split(/[,;]\s*/);
      for (const s of list.map(synonym)) if (s) current.synonyms.push(s);
      context = "synonyms";
      translate = null;
    } else if (name?.startsWith("note")) {
      if (value) addNote(value);
      context = "note";
    } else if (context === "start" && !current.definition) {
      current.definition = clip(value);
      context = "definition";
      translate = (t) => (current.language.definition ??= clip(t));
    } else if (context === "synonyms") {
      const s = synonym(value);
      if (s) current.synonyms.push(s);
    } else if (context === "example" || context === "definition" || context === "usage") {
      addExample(value);
      context = "example";
    } else {
      addNote(value);
    }
  }

  const seen = new Set<string>();
  return items
    .filter((i) => !seen.has(keyOf(i.text)) && seen.add(keyOf(i.text)))
    .map((i) => ({
      ...i,
      examples: i.examples.slice(0, SHEET_LIMIT.list),
      synonyms: i.synonyms.slice(0, SHEET_LIMIT.list),
      language: { ...i.language, notes: i.language.notes.slice(0, SHEET_LIMIT.list) },
    }));
}
