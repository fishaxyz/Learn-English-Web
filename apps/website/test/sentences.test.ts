import { describe, expect, it } from "vitest";
import { sentenceAt } from "../lib/text-spans";

describe("the sentence around a point in the text", () => {
  const text = "Zoë 🚆 left early. “Was it late?” she asked… Then rain";
  const span = (at: number) => {
    const s = sentenceAt(text, at);
    return s ? [...text].slice(s.start, s.end).join("") : null;
  };

  it("finds the sentence, counting code points, without the spaces around it", () => {
    expect(span(0)).toBe("Zoë 🚆 left early.");
    expect(span(6)).toBe("Zoë 🚆 left early.");
    expect(span(20)).toBe("“Was it late?”");
  });

  it("keeps closing quotes with their sentence, and a last sentence without an end mark", () => {
    expect(span(33)).toBe("she asked…");
    expect(span([...text].length - 1)).toBe("Then rain");
  });

  it("is null for the space between sentences", () => {
    expect(sentenceAt(text, [..."Zoë 🚆 left early."].length)).toBeNull();
    expect(sentenceAt("", 0)).toBeNull();
  });
});
