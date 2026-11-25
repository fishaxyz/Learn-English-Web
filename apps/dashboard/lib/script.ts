/** A pasted script as paragraphs of lines: a blank line starts a new paragraph; line breaks inside one are kept. */
function paragraphsOf(script: string): string[][] {
  return script
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length);
}

/** The script as the lesson's text, each paragraph with its own permanent block id. */
export function scriptToDoc(script: string) {
  const paragraphs = paragraphsOf(script);
  if (!paragraphs.length) return null;
  return {
    type: "doc",
    content: paragraphs.map((lines) => ({
      type: "paragraph",
      attrs: { id: `b${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}` },
      content: lines.flatMap((text, i) => [...(i ? [{ type: "hardBreak" }] : []), { type: "text", text }]),
    })),
  };
}

/** Characters one voice-over of the script reads (the same count the API uses for the saved text). */
export const scriptCharacters = (script: string) =>
  [
    ...paragraphsOf(script)
      .map((l) => l.join("\n"))
      .join("\n\n"),
  ].length;
