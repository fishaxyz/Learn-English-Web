import { describe, expect, it } from "vitest";
import { voiceCharacters } from "../components/voice-picker";
import { scriptCharacters, scriptToDoc } from "../lib/script";

describe("pasted script", () => {
  const script = "  My Commute \r\n\r\nShe leaves at seven.\nThe bus is late.\n \n\n\nZoë 🚆 waits.  ";

  it("starts a paragraph at each blank line, keeps line breaks, and gives every paragraph an id", () => {
    const doc = scriptToDoc(script);
    expect(doc?.content.map((p) => p.content)).toEqual([
      [{ type: "text", text: "My Commute" }],
      [
        { type: "text", text: "She leaves at seven." },
        { type: "hardBreak" },
        { type: "text", text: "The bus is late." },
      ],
      [{ type: "text", text: "Zoë 🚆 waits." }],
    ]);
    const ids = doc?.content.map((p) => p.attrs.id) ?? [];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^b[0-9a-f]{12}$/);
  });

  it("counts characters the way the saved text is counted, in code points", () => {
    expect(scriptCharacters(script)).toBe(voiceCharacters(scriptToDoc(script)));
    expect(scriptCharacters("Zoë 🚆")).toBe(5);
  });

  it("has no text when the script is empty or only spaces", () => {
    expect(scriptToDoc(" \n\n \t")).toBeNull();
    expect(scriptCharacters("")).toBe(0);
  });
});
