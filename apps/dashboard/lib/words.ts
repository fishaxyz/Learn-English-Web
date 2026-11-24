export const KINDS = [
  ["WORD", "Word"],
  ["PHRASE", "Phrase"],
  ["COLLOCATION", "Collocation"],
  ["IDIOM", "Idiom"],
  ["PHRASAL_VERB", "Phrasal verb"],
  ["SENTENCE_PATTERN", "Sentence pattern"],
] as const;

export type Kind = (typeof KINDS)[number][0];

export const kindLabel = (kind: string) => KINDS.find(([k]) => k === kind)?.[1] ?? kind;

/** Learners' languages for translations. Vietnamese first; any other BCP 47 code can be typed in. */
export const LANGUAGES: [string, string][] = [
  ["vi", "Vietnamese"],
  ["es", "Spanish"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["fr", "French"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["th", "Thai"],
  ["id", "Indonesian"],
];

/** "run late" + "verb phrase" → "run-late-verb-phrase": a stable key editors can still change. */
export const senseKeyFor = (headword: string, partOfSpeech: string) =>
  `${headword} ${partOfSpeech}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export function senseStatus(s: { draft: { status: string } | null; published: { id: string } | null }) {
  if (s.draft && s.published) return "Published · new draft";
  if (s.draft) return "Draft";
  return "Published";
}
