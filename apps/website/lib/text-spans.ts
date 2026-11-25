/**
 * Positions in the lesson text, the way the API counts them: per block (`data-block-id`), in Unicode code points
 * (the DOM counts UTF-16 units). Additions that aren't lesson text are skipped: screen-reader notes ("(in your
 * list)") and speaker names. Used by the read-along highlight and by "click a sentence to hear it".
 */

const SKIP = ".sr-only, [data-extra]";

function textNodes(block: HTMLElement): Text[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

export const blockById = (container: HTMLElement, blockId: string) =>
  container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);

/** A block's text, as the API sees it (so code-point offsets line up). */
export const blockText = (block: HTMLElement) =>
  textNodes(block)
    .map((n) => n.data)
    .join("");

/** A DOM range over code points [start, end) of a block's text. */
export function rangeForSpan(container: HTMLElement, blockId: string, start: number, end: number): Range | null {
  const block = blockById(container, blockId);
  if (!block || end <= start) return null;
  const range = document.createRange();
  let codePoint = 0;
  let started = false;
  for (const node of textNodes(block)) {
    let unit = 0;
    for (const char of node.data) {
      if (!started && codePoint === start) {
        range.setStart(node, unit);
        started = true;
      }
      if (codePoint === end) {
        range.setEnd(node, unit);
        return started ? range : null;
      }
      codePoint += 1;
      unit += char.length;
    }
    if (started && codePoint === end) {
      range.setEnd(node, unit);
      return range;
    }
  }
  return null;
}

/** The block and code-point offset under a point on screen, or null when it isn't lesson text. */
export function pointInText(container: HTMLElement, x: number, y: number): { blockId: string; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let unitOffset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) [node, unitOffset] = [pos.offsetNode, pos.offset];
  else {
    const range = document.caretRangeFromPoint?.(x, y);
    if (range) [node, unitOffset] = [range.startContainer, range.startOffset];
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !container.contains(node)) return null;
  const block = (node.parentElement?.closest("[data-block-id]") ?? null) as HTMLElement | null;
  const blockId = block?.dataset["blockId"];
  if (!block || !blockId || node.parentElement?.closest(SKIP)) return null;
  let offset = 0;
  for (const n of textNodes(block)) {
    if (n === node) return { blockId, offset: offset + [...n.data.slice(0, unitOffset)].length };
    offset += [...n.data].length;
  }
  return null;
}

/**
 * The sentence around a code-point offset of a text: from after the previous ".", "!", "?" or "…" (and any closing
 * quote or bracket) to its own end mark, without surrounding spaces. Null for blank space between sentences.
 */
export function sentenceAt(text: string, offset: number): { start: number; end: number } | null {
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
  return sentences.find((s) => offset >= s.start && offset < s.end) ?? null;
}
