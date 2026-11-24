"use client";

import type { SenseCardFragment } from "@english/graphql";
import { LexicalTerm } from "./lexical";
import { RichTextRenderer } from "./rich-text";

/**
 * A lesson text whose linked words open their meaning in place. Server-rendered like any page (so the text
 * is in the HTML), then interactive. Shared by the website and the dashboard's preview.
 */
export function LinkedText({ body, vocabulary }: { body: unknown; vocabulary: SenseCardFragment[] }) {
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
