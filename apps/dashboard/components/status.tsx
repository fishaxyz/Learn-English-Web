import type { EditorialSummaryFragment } from "@english/graphql";

type Localization = EditorialSummaryFragment["localizations"][number];

/** One label for where a lesson stands, in the words editors use. */
export function statusOf(archivedAt: string | null, l: Localization | undefined) {
  if (archivedAt) return { label: "Archived", tone: "muted" as const };
  if (l?.draft?.status === "IN_REVIEW") return { label: "In review", tone: "attention" as const };
  if (l?.draft && l.published) return { label: "Published · new draft", tone: "accent" as const };
  if (l?.draft) return { label: "Draft", tone: "muted" as const };
  if (l?.published) return { label: "Published", tone: "good" as const };
  return { label: "Empty", tone: "muted" as const };
}

const TONES = {
  muted: "bg-line/60 text-ink",
  attention: "bg-sun text-on-pastel",
  accent: "bg-sky text-on-pastel",
  good: "bg-pink text-on-pastel",
};

export function StatusChip({
  archivedAt,
  localization,
}: {
  archivedAt: string | null;
  localization: Localization | undefined;
}) {
  const s = statusOf(archivedAt, localization);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[s.tone]}`}>{s.label}</span>
  );
}
