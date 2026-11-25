/**
 * What a voice-over would read from a document, counted the way the API counts it (apps/api audio service): text
 * blocks joined by blank lines, in code points, with any "HOST1:"/"HOST2:" label left out.
 */
type Node = { type?: string; text?: string; content?: Node[] };

const HOST_PREFIX = /^\s*HOST\s?([12])\s*:\s*/i;

export type VoiceText = {
  /** Characters one single-voice voice-over reads. */
  single: number;
  /** Characters a conversation reads: only the HOST1/HOST2 turns. */
  conversation: number;
  turns: { host1: number; host2: number };
  /** Text blocks that aren't a host's turn (titles, notes): a conversation skips them. */
  otherBlocks: number;
  /** The longest single turn, in characters. */
  longestTurn: number;
};

export function voiceText(doc: unknown): VoiceText {
  const blocks: string[] = [];
  const inline = (n: Node): string =>
    n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(inline).join("");
  const walk = (n: Node) => {
    if (n.content?.some((c) => c.type === "text" || c.type === "hardBreak")) {
      blocks.push(inline(n));
      return;
    }
    n.content?.forEach(walk);
  };
  if (doc && typeof doc === "object") walk(doc as Node);

  const read: string[] = [];
  const out: VoiceText = { single: 0, conversation: 0, turns: { host1: 0, host2: 0 }, otherBlocks: 0, longestTurn: 0 };
  for (const raw of blocks) {
    const label = HOST_PREFIX.exec(raw);
    const text = label ? raw.slice(label[0].length) : raw;
    if (!text.trim()) continue;
    read.push(text);
    const length = [...text].length;
    if (label) {
      out.turns[label[1] === "1" ? "host1" : "host2"] += 1;
      out.conversation += length;
      out.longestTurn = Math.max(out.longestTurn, length);
    } else {
      out.otherBlocks += 1;
    }
  }
  out.single = [...read.join("\n\n")].length;
  return out;
}
