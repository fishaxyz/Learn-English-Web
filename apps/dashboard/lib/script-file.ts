import type { JSONContent } from "@tiptap/core";

/**
 * Reads a lesson's script file (ADR 0012): the first line is the title, a short second line the summary, then one
 * paragraph per line. IELTS paragraph letters at the start of a paragraph ("A  For most…") are dropped (the reading
 * page and matching questions letter paragraphs themselves), and so are **bold** marks: the article stays clean,
 * its vocabulary lives in the vocabulary sheet.
 */
export type ScriptFile = { title: string | null; summary: string | null; paragraphs: string[] };

const LETTER = /^[A-Z](?:[.)]\s*|\s{2,}|\t\s*)(?=\S)/;
const SMALL = new Set(["a", "an", "the", "of", "and", "or", "in", "on", "at", "to", "for", "by", "with", "from"]);

const tidy = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** "THE VANISHING DARK" → "The Vanishing Dark"; a title that isn't all capitals stays as it is. */
function titleCase(s: string) {
  if (s !== s.toUpperCase() || !/\p{L}/u.test(s)) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A heading line: short, not a paragraph (no IELTS letter, no full stop at the end). */
const isHeading = (line: string) => line.length <= 150 && !LETTER.test(line) && !/[.!?:]$/.test(line);

export function parseScriptFile(text: string): ScriptFile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let title: string | null = null;
  let summary: string | null = null;
  // A title (and a summary) only when the text has paragraphs after them.
  if (lines.length > 1 && isHeading(lines[0] ?? "")) {
    title = titleCase(tidy(lines.shift() ?? ""));
    if (lines.length > 1 && isHeading(lines[0] ?? "")) summary = tidy(lines.shift() ?? "");
  }
  const paragraphs = lines.map((l) => tidy(l.replace(LETTER, ""))).filter(Boolean);
  return { title, summary, paragraphs };
}

/** The paragraphs as the editor's document, each with its own block id (as the editor gives new paragraphs). */
export function scriptDocument(paragraphs: string[]): JSONContent {
  const id = () => `b${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return {
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", attrs: { id: id() }, content: [{ type: "text", text }] })),
  };
}
