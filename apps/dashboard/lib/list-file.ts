/**
 * Reads an editor's lexical list from a file, in the browser: plain text (.txt) as it is, and a Word document
 * (.docx) as its paragraphs, one per line. A .docx is a zip; only its main document (word/document.xml) is read,
 * with size limits, so nothing in the file is ever run or uploaded.
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

/** The paragraphs of a .docx, one per line (a tab stays a tab, so "item<tab>note" works). */
export async function docxText(bytes: Uint8Array): Promise<string> {
  const xml = await zipEntry(bytes, "word/document.xml");
  if (xml === null) throw new ListFileError("That isn't a Word document (.docx).");
  // Text runs, tabs and line breaks in order; a paragraph's end is a new line. Everything else is markup.
  let text = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<\/w:p>/g)) {
    text += m[1] !== undefined ? m[1] : m[0] === "<w:tab/>" ? "\t" : "\n";
  }
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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
