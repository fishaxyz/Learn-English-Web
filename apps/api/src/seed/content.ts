// Original sample content for local development and tests (AGENTS.md §5.6). Written for this project.
// No audio is included: the listening lesson has a transcript only, and says so. Audio arrives in Phase 3.
import type { ExerciseSetInput } from "../modules/assessment/schemas";
import type { RichTextDocument } from "../modules/rich-text";

let block = 0;
type TextNode = {
  type: "text";
  text: string;
  marks?: { type: "lexical"; attrs: { senseRevisionId: string; key?: boolean } }[];
};

/**
 * A paragraph from a string. `{{word|sense-key}}` links a word to a sense, and `{{word|sense-key|key}}` also marks
 * it a key word; until the senses exist, the mark
 * carries the key, and `linkSenses` swaps in the sense revision id.
 */
const p = (text: string) => ({
  type: "paragraph",
  attrs: { id: `blk-${++block}` },
  content: text
    .split(/(\{\{[^}]+\}\})/)
    .filter(Boolean)
    .map((part): TextNode => {
      const link = part.match(/^\{\{([^|]+)\|([^|}]+)(\|key)?\}\}$/);
      return link
        ? {
            type: "text",
            text: link[1] ?? "",
            marks: [
              {
                type: "lexical",
                attrs: { senseRevisionId: `key:${link[2]}`, ...(link[3] ? { key: true } : {}) },
              },
            ],
          }
        : { type: "text", text: part };
    }),
});
export const doc = (...paragraphs: string[]): RichTextDocument => ({ type: "doc", content: paragraphs.map(p) });

/** Replaces `key:<sense-key>` placeholders with the senses' published revision ids. */
export function linkSenses(document: RichTextDocument, revisions: Map<string, string>): RichTextDocument {
  return JSON.parse(
    JSON.stringify(document).replace(/"key:([a-z0-9-]+)"/g, (_, key: string) => {
      const id = revisions.get(key);
      if (!id) throw new Error(`Seed text links to an unknown sense: ${key}`);
      return JSON.stringify(id);
    })
  ) as RichTextDocument;
}

export const TOPICS = [
  { slug: "daily-life", name: "Daily life", description: "Everyday routines, home and free time." },
  { slug: "travel", name: "Travel", description: "Getting around, journeys and holidays." },
  { slug: "work", name: "Work", description: "Jobs, offices and working life." },
];

export const EXAM_LABELS = [{ code: "IELTS", name: "IELTS" }];

type SeedSense = {
  key: string;
  headword: string;
  kind: "WORD" | "PHRASE" | "COLLOCATION" | "IDIOM" | "PHRASAL_VERB" | "SENTENCE_PATTERN";
  partOfSpeech: string;
  definition: string;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  usageNote?: string;
  register?: string;
  examples: { sentence: string }[];
  pronunciations: { accent: string; ipa: string }[];
  /** Sample translations, written for this project; editors should review them. */
  translations?: { locale: string; text: string }[];
};

export const SENSES: SeedSense[] = [
  {
    key: "commute-noun",
    headword: "commute",
    kind: "WORD",
    partOfSpeech: "noun",
    definition: "the journey you make regularly between your home and your place of work or study",
    cefrLevel: "B1",
    examples: [{ sentence: "My commute takes about forty minutes by train." }],
    translations: [{ locale: "vi", text: "quãng đường đi làm (hoặc đi học) hằng ngày" }],
    pronunciations: [
      { accent: "en-GB", ipa: "/kəˈmjuːt/" },
      { accent: "en-US", ipa: "/kəˈmjuːt/" },
    ],
  },
  {
    key: "bank-noun-money",
    headword: "bank",
    kind: "WORD",
    partOfSpeech: "noun",
    definition: "an organization where people keep their money and that lends money to people and businesses",
    cefrLevel: "A2",
    examples: [{ sentence: "I need to go to the bank before it closes." }],
    translations: [{ locale: "vi", text: "ngân hàng" }],
    pronunciations: [
      { accent: "en-GB", ipa: "/bæŋk/" },
      { accent: "en-US", ipa: "/bæŋk/" },
    ],
  },
  {
    key: "bank-noun-river",
    headword: "bank",
    kind: "WORD",
    partOfSpeech: "noun",
    definition: "the land along the side of a river",
    cefrLevel: "B1",
    usageNote: "Usually in phrases like the river bank or on the banks of the river.",
    examples: [{ sentence: "We had a picnic on the bank of the river." }],
    translations: [{ locale: "vi", text: "bờ sông" }],
    pronunciations: [{ accent: "en-GB", ipa: "/bæŋk/" }],
  },
  {
    key: "rush-hour-noun",
    headword: "rush hour",
    kind: "COLLOCATION",
    partOfSpeech: "noun",
    definition: "the busy times of day when most people are travelling to or from work",
    cefrLevel: "B1",
    examples: [{ sentence: "The trains are always full during rush hour." }],
    translations: [{ locale: "vi", text: "giờ cao điểm" }],
    pronunciations: [{ accent: "en-GB", ipa: "/ˈrʌʃ ˌaʊə/" }],
  },
  {
    key: "run-late",
    headword: "run late",
    kind: "PHRASE",
    partOfSpeech: "verb phrase",
    definition: "to be later than you planned or than you should be",
    cefrLevel: "B1",
    register: "informal",
    examples: [{ sentence: "Sorry, I'm running late – the bus didn't come." }],
    translations: [{ locale: "vi", text: "bị trễ, đến muộn hơn dự định" }],
    pronunciations: [],
  },
];

/** A sentence pattern: learners add it whole (`SENTENCE_PATTERN`). */
SENSES.push({
  key: "like-verb-ing",
  headword: "like + verb-ing",
  kind: "SENTENCE_PATTERN",
  partOfSpeech: "pattern",
  definition: "to enjoy doing something, often as a habit: like (or love, hate, don't mind) + the -ing form of a verb",
  cefrLevel: "A2" as const,
  examples: [{ sentence: "I like reading on the train." }, { sentence: "He doesn't like getting up early." }],
  translations: [{ locale: "vi", text: "thích làm gì (sở thích, thói quen)" }],
  pronunciations: [],
});

export const READING = {
  slug: "a-morning-commute",
  title: "A Morning Commute",
  summary: "Mia takes the same train to work every day. This morning is different.",
  cefrLevel: "A2" as const,
  topicSlugs: ["daily-life", "travel"],
  body: doc(
    "Mia lives in a small town and works in the city. Every morning she leaves her flat at seven o'clock and walks to the station. Her {{commute|commute-noun|key}} takes about forty minutes.",
    "She usually reads a book on the train. During {{rush hour|rush-hour-noun|key}} the train is very busy, so she often has to stand. She doesn't mind, because she {{likes watching|like-verb-ing}} the fields and the {{bank|bank-noun-river}} of the river from the window.",
    'This morning, the train stopped between two stations. Nobody knew why. After twenty minutes it started again, and Mia arrived at the office late for the first time this year. Her manager just smiled and said, "Trains!"'
  ),
  exercises: [
    {
      title: "Check your understanding",
      instructions: "Read the text, then answer the questions.",
      questions: [
        {
          type: "TRUE_FALSE_NOT_GIVEN",
          prompt: { statement: "Mia drives to work." },
          grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "FALSE" },
          explanation: "She walks to the station and takes the train.",
        },
        {
          type: "TRUE_FALSE_NOT_GIVEN",
          prompt: { statement: "Mia's manager was angry." },
          grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "FALSE" },
          explanation: "Her manager smiled.",
        },
        {
          type: "TRUE_FALSE_NOT_GIVEN",
          prompt: { statement: "Mia has a cat." },
          grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "NOT_GIVEN" },
          explanation: "The text doesn't say anything about pets.",
        },
        {
          type: "SINGLE_CHOICE",
          prompt: { stem: "Why does Mia often stand on the train?" },
          options: ["She likes standing.", "The train is very busy.", "There are no seats on her train."],
          grading: { type: "SINGLE_CHOICE", correctOption: 1 },
          explanation: "During {{rush hour|rush-hour-noun|key}} the train is very busy.",
        },
        {
          type: "GAP_FILL",
          prompt: { segments: [{ text: "Mia's commute takes about " }, { gapId: "time" }, { text: " minutes." }] },
          grading: { type: "GAP_FILL", gaps: [{ gapId: "time", accepted: ["forty", "40"] }] },
        },
      ],
    },
  ] satisfies ExerciseSetInput[],
};

export const LISTENING = {
  slug: "running-late",
  title: "Running Late",
  summary: "Sam calls Ana to say he'll be late. Transcript only for now: the audio will be added later.",
  cefrLevel: "A2" as const,
  topicSlugs: ["daily-life", "work"],
  body: doc(
    "Ana: Hi Sam, where are you? The meeting starts in five minutes.",
    "Sam: I'm so sorry, I'm {{running late|run-late}}. My bus didn't come, so I'm walking.",
    "Ana: Don't worry. How long will you be?",
    "Sam: About fifteen minutes, I think. Can you start without me?",
    "Ana: Sure. I'll send you the notes after the meeting."
  ),
  exercises: [
    {
      title: "Listen and answer",
      questions: [
        {
          type: "SINGLE_CHOICE",
          prompt: { stem: "Why is Sam late?" },
          options: ["He missed his train.", "His bus didn't come.", "He forgot about the meeting."],
          grading: { type: "SINGLE_CHOICE", correctOption: 1 },
        },
        {
          type: "GAP_FILL",
          prompt: { segments: [{ text: "Sam will arrive in about " }, { gapId: "minutes" }, { text: " minutes." }] },
          grading: { type: "GAP_FILL", gaps: [{ gapId: "minutes", accepted: ["fifteen", "15"] }] },
        },
      ],
    },
  ] satisfies ExerciseSetInput[],
};

export const COLLECTION = {
  slug: "words-for-getting-to-work",
  title: "Words for Getting to Work",
  summary: "Useful words and phrases for talking about your journey to work.",
  cefrLevel: "B1" as const,
  topicSlugs: ["travel", "work"],
  body: doc("Learn these words, then use them to describe your own journey to work or school."),
  senseKeys: ["commute-noun", "rush-hour-noun", "run-late"],
};
