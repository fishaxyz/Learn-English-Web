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

const mark = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bold") }),
  z.strictObject({ type: z.literal("italic") }),
  z.strictObject({ type: z.literal("link"), attrs: z.strictObject({ href: safeHref }) }),
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
      attrs: z.strictObject({ id: blockId, level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
      content: z.array(node).max(500).optional(),
    }),
    z.strictObject({
      type: z.enum(BLOCKS).exclude(["heading"]),
      attrs: z.strictObject({ id: blockId }),
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
