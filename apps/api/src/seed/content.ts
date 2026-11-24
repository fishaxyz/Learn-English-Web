// Original sample content for local development and tests (AGENTS.md §5.6). Written for this project.
// No audio is included: the listening lesson has a transcript only, and says so. Audio arrives in Phase 3.
import type { ExerciseSetInput } from "../modules/assessment/schemas";
import type { RichTextDocument } from "../modules/rich-text";

let block = 0;
const p = (text: string) => ({
  type: "paragraph" as const,
  attrs: { id: `blk-${++block}` },
  content: [{ type: "text" as const, text }],
});
export const doc = (...paragraphs: string[]): RichTextDocument => ({ type: "doc", content: paragraphs.map(p) });

export const TOPICS = [
  { slug: "daily-life", name: "Daily life", description: "Everyday routines, home and free time." },
  { slug: "travel", name: "Travel", description: "Getting around, journeys and holidays." },
  { slug: "work", name: "Work", description: "Jobs, offices and working life." },
];

export const EXAM_LABELS = [{ code: "IELTS", name: "IELTS" }];

export const SENSES = [
  {
    key: "commute-noun",
    headword: "commute",
    kind: "WORD" as const,
    partOfSpeech: "noun",
    definition: "the journey you make regularly between your home and your place of work or study",
    cefrLevel: "B1" as const,
    examples: [{ sentence: "My commute takes about forty minutes by train." }],
    pronunciations: [
      { accent: "en-GB", ipa: "/kəˈmjuːt/" },
      { accent: "en-US", ipa: "/kəˈmjuːt/" },
    ],
  },
  {
    key: "bank-noun-money",
    headword: "bank",
    kind: "WORD" as const,
    partOfSpeech: "noun",
    definition: "an organization where people keep their money and that lends money to people and businesses",
    cefrLevel: "A2" as const,
    examples: [{ sentence: "I need to go to the bank before it closes." }],
    pronunciations: [
      { accent: "en-GB", ipa: "/bæŋk/" },
      { accent: "en-US", ipa: "/bæŋk/" },
    ],
  },
  {
    key: "bank-noun-river",
    headword: "bank",
    kind: "WORD" as const,
    partOfSpeech: "noun",
    definition: "the land along the side of a river",
    cefrLevel: "B1" as const,
    usageNote: "Usually in phrases like the river bank or on the banks of the river.",
    examples: [{ sentence: "We had a picnic on the bank of the river." }],
    pronunciations: [{ accent: "en-GB", ipa: "/bæŋk/" }],
  },
  {
    key: "rush-hour-noun",
    headword: "rush hour",
    kind: "COLLOCATION" as const,
    partOfSpeech: "noun",
    definition: "the busy times of day when most people are travelling to or from work",
    cefrLevel: "B1" as const,
    examples: [{ sentence: "The trains are always full during rush hour." }],
    pronunciations: [{ accent: "en-GB", ipa: "/ˈrʌʃ ˌaʊə/" }],
  },
  {
    key: "run-late",
    headword: "run late",
    kind: "PHRASE" as const,
    partOfSpeech: "verb phrase",
    definition: "to be later than you planned or than you should be",
    cefrLevel: "B1" as const,
    register: "informal",
    examples: [{ sentence: "Sorry, I'm running late – the bus didn't come." }],
    pronunciations: [],
  },
];

export const READING = {
  slug: "a-morning-commute",
  title: "A Morning Commute",
  summary: "Mia takes the same train to work every day. This morning is different.",
  cefrLevel: "A2" as const,
  topicSlugs: ["daily-life", "travel"],
  body: doc(
    "Mia lives in a small town and works in the city. Every morning she leaves her flat at seven o'clock and walks to the station. Her commute takes about forty minutes.",
    "She usually reads a book on the train. During rush hour the train is very busy, so she often has to stand. She doesn't mind, because she likes watching the fields and the river from the window.",
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
          explanation: "During rush hour the train is very busy.",
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
    "Sam: I'm so sorry, I'm running late. My bus didn't come, so I'm walking.",
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
