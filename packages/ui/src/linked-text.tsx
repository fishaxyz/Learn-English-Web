"use client";

import type { SenseCardFragment } from "@english/graphql";
import { LexicalTerm } from "./lexical";
import { RichTextRenderer, type SpeakerNames } from "./rich-text";

/**
 * A lesson text whose linked words open their meaning in place. Server-rendered like any page (so the text
 * is in the HTML), then interactive. Shared by the website and the dashboard's preview.
 */
export function LinkedText({
  body,
  vocabulary,
  speakers,
}: {
  body: unknown;
  vocabulary: SenseCardFragment[];
  speakers?: SpeakerNames;
}) {
  const byRevision = new Map(vocabulary.map((s) => [s.revisionId, s]));
  return (
    <RichTextRenderer
      doc={body}
      speakers={speakers}
      renderTerm={(senseRevisionId, children, key) => (
        <LexicalTerm key={key} sense={byRevision.get(senseRevisionId)}>
          {children}
        </LexicalTerm>
      )}
    />
  );
}
