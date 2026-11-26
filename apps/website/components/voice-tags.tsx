/** A voice's label as tags: who speaks ("Man", "Conversation") in blue, then the accent or hosts ("UK") in amber. */
export function VoiceTags({ label }: { label: string }) {
  const [who, ...rest] = label.split(" · ");
  const tag = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Voice: ${label}`}>
      <span aria-hidden="true">🎧</span>
      <span className={`${tag} bg-tag-blue-soft text-tag-blue`}>{who}</span>
      {rest.map((part) => (
        <span key={part} className={`${tag} bg-tag-amber-soft text-tag-amber`}>
          {part}
        </span>
      ))}
    </span>
  );
}
