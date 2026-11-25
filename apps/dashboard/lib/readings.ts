import type { EditorialListQuery } from "@english/graphql";
import { statusOf } from "../components/status";

type Resource = EditorialListQuery["editorialResources"][number];

/** One reading as the library lists it: its current state, taken from the draft if there is one. */
export type ReadingRow = {
  id: string;
  title: string;
  slug: string;
  status: ReturnType<typeof statusOf>;
  level: string | null;
  topics: { slug: string; name: string }[];
  updatedAt: string;
  live: boolean;
  /** Which of the four parts are finished (for the current draft, or the live lesson). */
  parts: Record<Part, boolean>;
};

/** The four parts of a reading lesson; review and publishing wait until all are finished. */
export const PARTS = [
  { id: "script", label: "Script", missing: "No script", filter: "Needs a script" },
  { id: "voiceover", label: "Voice-over", missing: "No voice-over", filter: "Needs a voice-over" },
  { id: "vocabulary", label: "Vocabulary", missing: "No vocabulary", filter: "Needs vocabulary" },
  { id: "questions", label: "Questions", missing: "No questions", filter: "Needs questions" },
] as const;
export type Part = (typeof PARTS)[number]["id"];
export const isReady = (row: ReadingRow) => PARTS.every((p) => row.parts[p.id]);

export type LibraryTab = "all" | "published" | "drafts" | "review" | "archived";

export const TABS: { id: LibraryTab; label: string }[] = [
  { id: "all", label: "All readings" },
  { id: "published", label: "Published" },
  { id: "drafts", label: "Drafts" },
  { id: "review", label: "In review" },
  { id: "archived", label: "Archived" },
];

/** Which tab a status belongs to; a published lesson with a new draft is in both Published and Drafts. */
export function inTab(row: ReadingRow, tab: LibraryTab): boolean {
  const s = row.status.label;
  if (tab === "archived") return s === "Archived";
  if (s === "Archived") return false;
  if (tab === "published") return s === "Published" || s === "Published · new draft";
  if (tab === "drafts") return s === "Draft" || s === "Published · new draft" || s === "Empty";
  if (tab === "review") return s === "In review";
  return true;
}

export function readingRows(resources: Resource[]): ReadingRow[] {
  return resources
    .filter((r) => r.kind === "READING")
    .map((r) => {
      const l = r.localizations[0];
      const current = l?.draft ?? l?.published;
      return {
        id: r.id,
        title: l?.draft?.title ?? l?.published?.title ?? "Untitled",
        slug: l?.slug ?? "",
        status: statusOf(r.archivedAt, l),
        level: current?.cefrLevel ?? null,
        topics: current?.topics ?? [],
        updatedAt: current?.updatedAt ?? r.createdAt,
        live: !!l?.published && !r.archivedAt,
        parts: {
          script: current?.checklist.script ?? false,
          voiceover: current?.checklist.voiceover ?? false,
          vocabulary: current?.checklist.vocabulary ?? false,
          questions: current?.checklist.questions ?? false,
        },
      };
    });
}

/** A picture for each topic, so lists are quick to scan (topics without one get a book). */
const TOPIC_EMOJI: Record<string, string> = {
  "daily-life": "🏡",
  travel: "✈️",
  work: "💼",
  "work-and-career": "💼",
  education: "📚",
  health: "❤️",
  environment: "🌿",
  technology: "💻",
  food: "🍲",
  culture: "🎭",
  science: "🔬",
  sport: "⚽",
  sports: "⚽",
  money: "💰",
  family: "👪",
};
export const topicEmoji = (slug: string | undefined) => (slug && TOPIC_EMOJI[slug]) || "📖";

/** Soft colours that cycle across topic cards. */
export const TINTS = ["bg-pink", "bg-sky", "bg-sun", "bg-good-soft"] as const;

/** Level chips: A levels green, B levels blue, C levels pink. */
export const levelTone = (level: string | null) =>
  level?.startsWith("A")
    ? "bg-good-soft text-good"
    : level?.startsWith("B")
      ? "bg-sky text-on-pastel"
      : level?.startsWith("C")
        ? "bg-pink text-on-pastel"
        : "bg-line/60 text-muted";
