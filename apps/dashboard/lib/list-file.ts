/**
 * Reads an editor's vocabulary sheet from a file, in the browser: plain text (.txt) as it is, and a Word document
 * (.docx) as its paragraphs, one per line. A .docx is a zip; only its main document (word/document.xml) and its list
 * numbering (word/numbering.xml) are read, with size limits, so nothing in the file is ever run or uploaded.
 */
export const MAX_LIST_FILE = 5 * 1024 * 1024;
const MAX_XML = 20 * 1024 * 1024;

export class ListFileError extends Error {}

export async function readListFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }) {
  if (file.size > MAX_LIST_FILE) throw new ListFileError("That file is too big: up to 5 MB.");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".txt")) return new TextDecoder().decode(bytes);
  if (name.endsWith(".docx")) return docxText(bytes);
  throw new ListFileError("Choose a .txt or .docx file.");
}

/**
 * The paragraphs of a .docx, one per line (a tab stays a tab, so "item<tab>note" works). Word's automatic numbering
 * isn't in the text, so it's written back: "1. ", "A. ", "a. " or "- " for a bullet, as Word shows it.
 */
export async function docxText(bytes: Uint8Array): Promise<string> {
  const xml = await zipEntry(bytes, "word/document.xml");
  if (xml === null) throw new ListFileError("That isn't a Word document (.docx).");
  const numbering = listFormats((await zipEntry(bytes, "word/numbering.xml")) ?? "");
  const counters = new Map<string, number[]>();
  const lines: string[] = [];
  for (const [, paragraph = ""] of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    // Text runs, tabs and line breaks in order. Everything else is markup.
    let text = "";
    for (const m of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>/g)) {
      text += m[1] !== undefined ? m[1] : m[0] === "<w:tab/>" ? "\t" : "\n";
    }
    const numId = /<w:numId w:val="(\d+)"/.exec(paragraph)?.[1];
    const level = Number(/<w:ilvl w:val="(\d+)"/.exec(paragraph)?.[1] ?? 0);
    const format = numId && numId !== "0" ? numbering(numId, level) : null;
    if (numId && format && text.trim()) {
      const count = counters.get(numId) ?? [];
      const n = (count[level] ?? format.start - 1) + 1;
      count[level] = n;
      count.length = level + 1; // a deeper list starts again under each item
      counters.set(numId, count);
      text = `${marker(format.format, n)}${text}`;
    }
    lines.push(text);
  }
  return lines
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** "1. ", "A. ", "a. " or "- " (a bullet, or a format we don't number). */
function marker(format: string, n: number) {
  if (format === "decimal" || format === "decimalZero") return `${n}. `;
  const letter = String.fromCharCode(64 + (((n - 1) % 26) + 1));
  if (format === "upperLetter") return `${letter}. `;
  if (format === "lowerLetter") return `${letter.toLowerCase()}. `;
  return "- ";
}

/** Word's list formats (word/numbering.xml): a list and level's number format and first number. */
function listFormats(xml: string) {
  const abstract = new Map<string, Map<number, { format: string; start: number }>>();
  for (const [, id = "", body = ""] of xml.matchAll(
    /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g
  )) {
    const levels = new Map<number, { format: string; start: number }>();
    for (const [, ilvl = "0", lvl = ""] of body.matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      levels.set(Number(ilvl), {
        format: /<w:numFmt w:val="(\w+)"/.exec(lvl)?.[1] ?? "decimal",
        start: Number(/<w:start w:val="(\d+)"/.exec(lvl)?.[1] ?? 1),
      });
    }
    abstract.set(id, levels);
  }
  const lists = new Map<string, string>();
  for (const [, numId = "", body = ""] of xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const id = /<w:abstractNumId w:val="(\d+)"/.exec(body)?.[1];
    if (id) lists.set(numId, id);
  }
  return (numId: string, level: number) => abstract.get(lists.get(numId) ?? "")?.get(level) ?? null;
}

/** One file of a zip archive, as text; null when it isn't there or the archive isn't a zip. */
async function zipEntry(bytes: Uint8Array, wanted: string): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is in the last 64 KB (plus its own 22 bytes).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra;
    if (name !== wanted) continue;
    if (size > MAX_XML || local + 30 > bytes.length) throw new ListFileError("That document is too big to read.");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method === 0) return new TextDecoder().decode(data);
    if (method !== 8) throw new ListFileError("That document uses a kind of compression we can't read.");
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    if (out.length > MAX_XML) throw new ListFileError("That document is too big to read.");
    return new TextDecoder().decode(out);
  }
  return null;
}
