import { z } from "zod";
import { invalid } from "../errors";

/**
 * Rich text, schema version 1: a Tiptap document limited to the nodes and marks below (AGENTS.md §7).
 * Unknown nodes, unknown marks, raw HTML and non-http(s)/mailto links are rejected, so stored content can
 * always be rendered safely. Every block carries a permanent `attrs.id`, which vocabulary annotations and
 * transcripts will point at.
 */
export const RICH_TEXT_SCHEMA_VERSION = 1;

const BLOCKS = ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem"] as const;
const LEAVES = ["hardBreak", "horizontalRule"] as const;
const MAX_BYTES = 200_000;
const MAX_DEPTH = 12;

const blockId = z.string().regex(/^[A-Za-z0-9_-]{4,64}$/, "block ids are 4-64 letters, digits, - or _");

const safeHref = z
  .string()
  .max(2000)
  .refine((href) => {
    try {
      return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
    } catch {
      return false;
    }
  }, "links must be http(s) or mailto");

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "must be an id");

// Attribute objects drop keys they don't know (Tiptap adds harmless defaults like target or class); node and
// mark objects are strict, so unknown node shapes are rejected, not passed through.
const mark = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bold") }),
  z.strictObject({ type: z.literal("italic") }),
  z.strictObject({ type: z.literal("link"), attrs: z.object({ href: safeHref }) }),
  /** A word or phrase linked to one exact sense revision: the vocabulary pop-up (AGENTS.md §5.2). */
  z.strictObject({
    type: z.literal("lexical"),
    // `key`: the editor marked it a key word of the text (suggested to learners first).
    attrs: z.object({ senseRevisionId: uuid, key: z.boolean().optional() }),
  }),
]);

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  text?: string;
  marks?: z.infer<typeof mark>[];
};

const textNode = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1).max(20_000),
  marks: z.array(mark).max(5).optional(),
});

const node: z.ZodType<RichTextNode> = z.lazy(() =>
  z.union([
    textNode,
    z.strictObject({ type: z.enum(LEAVES) }),
    z.strictObject({
      type: z.literal("heading"),
      attrs: z.object({ id: blockId, level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
      content: z.array(node).max(500).optional(),
    }),
    z.strictObject({
      type: z.enum(BLOCKS).exclude(["heading"]),
      attrs: z.object({ id: blockId }),
      content: z.array(node).max(500).optional(),
    }),
  ])
);

const documentSchema = z.strictObject({ type: z.literal("doc"), content: z.array(node).max(2000) });

export type RichTextDocument = z.infer<typeof documentSchema>;

export const EMPTY_DOCUMENT: RichTextDocument = { type: "doc", content: [] };

function depth(n: RichTextNode, level = 0): number {
  return Math.max(level, ...(n.content ?? []).map((c) => depth(c, level + 1)));
}

/** Validates a document from a client or a job. Throws VALIDATION_ERROR naming the first problem. */
export function parseRichText(input: unknown): RichTextDocument {
  if (JSON.stringify(input ?? null).length > MAX_BYTES) throw invalid("The document is too large");
  const result = documentSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalid(`Invalid rich text at ${issue?.path.join(".") || "document"}: ${issue?.message ?? "unknown"}`);
  }
  if (depth(result.data as RichTextNode) > MAX_DEPTH) throw invalid("The document is nested too deeply");
  const ids = new Set<string>();
  const walk = (n: RichTextNode) => {
    const id = n.attrs?.["id"];
    if (typeof id === "string") {
      if (ids.has(id)) throw invalid(`Block id "${id}" is used twice`);
      ids.add(id);
    }
    n.content?.forEach(walk);
  };
  result.data.content.forEach(walk);
  return result.data;
}

/** The document's text: blocks separated by newlines. Used for search, word counts and reading time. */
export function plainTextOf(doc: RichTextDocument): string {
  const blocks: string[] = [];
  const inline = (n: RichTextNode): string =>
    n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(inline).join("");
  const walk = (n: RichTextNode) => {
    if (n.type === "paragraph" || n.type === "heading") blocks.push(inline(n));
    else n.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return blocks.join("\n").trim();
}

/** Words in a text, counting letters and digits in any script ("don't" and "well-known" are one word each). */
export function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** At about 200 words a minute, rounded up to whole seconds. */
export const readingSeconds = (words: number) => Math.ceil((words / 200) * 60);

export type Annotation = {
  blockId: string;
  start: number;
  end: number;
  surfaceText: string;
  senseRevisionId: string;
  isKey: boolean;
};

/**
 * The document's vocabulary links, as stored in lexical_annotations. Offsets are Unicode code points (not
 * UTF-16 units) into the text of the innermost block with an id, where a hard break counts as one ("\n"):
 * "🚆 bank" puts "bank" at 2–6. Adjacent text nodes with the same sense are one annotation.
 */
export function annotationsOf(doc: RichTextDocument): Annotation[] {
  const out: Annotation[] = [];
  const walk = (n: RichTextNode) => {
    const id = n.attrs?.["id"];
    const hasInline = n.content?.some((c) => c.type === "text" || c.type === "hardBreak");
    if (typeof id === "string" && hasInline) {
      let offset = 0;
      let open: Annotation | null = null;
      for (const child of n.content ?? []) {
        const text = child.type === "text" ? (child.text ?? "") : child.type === "hardBreak" ? "\n" : "";
        const length = [...text].length;
        const sense = child.marks?.find((m) => m.type === "lexical")?.attrs;
        const senseId = sense && "senseRevisionId" in sense ? sense.senseRevisionId : null;
        const isKey = Boolean(sense && "key" in sense && sense.key);
        if (senseId && open && open.senseRevisionId === senseId && open.end === offset) {
          open.end += length;
          open.surfaceText += text;
          open.isKey ||= isKey;
        } else if (senseId) {
          open = {
            blockId: id,
            start: offset,
            end: offset + length,
            surfaceText: text,
            senseRevisionId: senseId,
            isKey,
          };
          out.push(open);
        } else {
          open = null;
        }
        offset += length;
      }
    }
    n.content?.forEach((c) => {
      if (c.type !== "text") walk(c);
    });
  };
  doc.content.forEach(walk);
  return out;
}

/** Each block's inline text, in document order (the same text annotation offsets count into). */
export function blockTexts(doc: RichTextDocument): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (n: RichTextNode) => {
    const id = n.attrs?.["id"];
    if (typeof id === "string" && n.content?.some((c) => c.type === "text" || c.type === "hardBreak")) {
      out.set(
        id,
        n.content.map((c) => (c.type === "text" ? (c.text ?? "") : c.type === "hardBreak" ? "\n" : "")).join("")
      );
    }
    n.content?.forEach((c) => {
      if (c.type !== "text") walk(c);
    });
  };
  doc.content.forEach(walk);
  return out;
}

/**
 * The sentence around a span (offsets in code points): from just after the previous ". ", "! ", "? " or line
 * break, to the next sentence end. Good enough for showing a word in its context; not a full sentence parser.
 */
export function sentenceAround(text: string, start: number, end: number): string {
  const chars = [...text];
  let from = start;
  while (from > 0) {
    const prev = chars[from - 1] ?? "";
    if (prev === "\n" || (/\s/.test(prev) && /[.!?]/.test(chars[from - 2] ?? ""))) break;
    from -= 1;
  }
  let to = end;
  while (to < chars.length) {
    const c = chars[to] ?? "";
    if (c === "\n") break;
    if (/[.!?]/.test(c) && (to + 1 >= chars.length || /[\s"”’)]/.test(chars[to + 1] ?? ""))) {
      to += 1;
      while (/["”’)]/.test(chars[to] ?? "")) to += 1;
      break;
    }
    to += 1;
  }
  return chars.slice(from, to).join("").trim();
}

/**
 * A text's sentences, as code-point spans: each runs from after the previous ".", "!", "?" or "…" (and any closing
 * quote or bracket) to its own end mark, without surrounding spaces. The website splits sentences with the same
 * rule (apps/website/lib/text-spans.ts), so translations line up with the sentences learners tap and hear.
 */
export function sentencesOf(text: string): { start: number; end: number }[] {
  const chars = [...text];
  const sentences: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i <= chars.length; i++) {
    const c = chars[i];
    const atEnd = i === chars.length;
    if (atEnd || /[.!?…]/.test(c ?? "")) {
      let end = atEnd ? i : i + 1;
      while (!atEnd && end < chars.length && /[.!?…"'”’)\]]/.test(chars[end] ?? "")) end += 1;
      let s = start;
      while (s < end && /\s/.test(chars[s] ?? "")) s += 1;
      let e = end;
      while (e > s && /\s/.test(chars[e - 1] ?? "")) e -= 1;
      if (e > s) sentences.push({ start: s, end: e });
      if (atEnd) break;
      start = end;
      i = end - 1;
    }
  }
  return sentences;
}
