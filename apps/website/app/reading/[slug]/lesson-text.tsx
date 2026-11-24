"use client";

import type { SenseCardFragment } from "@english/graphql";
import { LexicalTerm, RichTextRenderer } from "@english/ui";

/**
 * The lesson text, rendered on the server like any page (so it's in the HTML for readers and search engines),
 * then made interactive: linked words open their meaning in place.
 */
export function LessonText({ body, vocabulary }: { body: unknown; vocabulary: SenseCardFragment[] }) {
  const byRevision = new Map(vocabulary.map((s) => [s.revisionId, s]));
  return (
    <RichTextRenderer
      doc={body}
      renderTerm={(senseRevisionId, children, key) => (
        <LexicalTerm key={key} sense={byRevision.get(senseRevisionId)}>
          {children}
        </LexicalTerm>
      )}
    />
  );
}
