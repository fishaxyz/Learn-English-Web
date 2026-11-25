import { describe, expect, it } from "vitest";
import { voiceText } from "../lib/voice-text";

const doc = (...lines: string[]) => ({
  type: "doc",
  content: lines.map((text, i) => ({
    type: "paragraph",
    attrs: { id: `b${i}` },
    content: text ? [{ type: "text", text }] : [],
  })),
});

describe("what a voice-over reads", () => {
  it("counts like the API: blocks joined by blank lines, in code points", () => {
    expect(voiceText(doc("Zoë 🚆 left.", "", "Then rain.")).single).toBe(23);
  });

  it("leaves HOST1:/HOST2: labels out, and counts each host's turns", () => {
    const text = voiceText(doc("A Morning Chat", "HOST1: Hi, Max.", "host 2 : Hello!", "HOST1: Bye."));
    expect(text.single).toBe([..."A Morning Chat\n\nHi, Max.\n\nHello!\n\nBye."].length);
    expect(text.conversation).toBe(8 + 6 + 4);
    expect(text.turns).toEqual({ host1: 2, host2: 1 });
    expect(text.otherBlocks).toBe(1);
    expect(text.longestTurn).toBe(8);
  });

  it("is empty for no document", () => {
    expect(voiceText(null)).toMatchObject({ single: 0, conversation: 0, otherBlocks: 0 });
  });
});
