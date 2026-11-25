import { PARTS, type Part } from "../lib/readings";
import { ArticleIcon, HeadphonesIcon, LayersIcon, QuestionIcon } from "./icons";

export const PART_ICONS = {
  script: ArticleIcon,
  voiceover: HeadphonesIcon,
  vocabulary: LayersIcon,
  questions: QuestionIcon,
};
const DONE_TONE: Record<Part, string> = {
  script: "bg-pink",
  voiceover: "bg-sky",
  vocabulary: "bg-sun",
  questions: "bg-good-soft",
};

/**
 * A lesson's four parts at a glance: a filled icon for each finished part, and an outlined "No voice-over" tag
 * for each one still to do, so unfinished lessons stand out in lists.
 */
export function PartTags({ parts, compact = false }: { parts: Record<Part, boolean>; compact?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label="Lesson parts">
      {PARTS.map((p) => {
        const Icon = PART_ICONS[p.id];
        const done = parts[p.id];
        return (
          <li key={p.id}>
            {done ? (
              <span
                title={`${p.label}: done`}
                className={`grid size-7 place-items-center rounded-full text-on-pastel ${DONE_TONE[p.id]}`}
              >
                <Icon width={14} height={14} />
                <span className="sr-only">{p.label}: done</span>
              </span>
            ) : (
              <span
                title={p.missing}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-ink/30 px-2 text-xs font-medium text-muted"
              >
                <Icon width={14} height={14} />
                <span className={compact ? "sr-only" : ""}>{p.missing}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
