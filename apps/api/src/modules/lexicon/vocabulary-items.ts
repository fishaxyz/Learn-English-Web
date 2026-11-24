import type { GraphQLContext } from "../../context";
import type { RevisionModel, VocabularyItemModel } from "../../models";
import { present } from "../../rows";
import { blockTexts, sentenceAround, type RichTextDocument } from "../rich-text";

/**
 * A revision's vocabulary links grouped into items, one per linked sense revision, in the order they first
 * appear in the text. A structure split over two places ("not only … but also") is one item with two
 * occurrences, each with its sentence.
 */
export async function vocabularyItems(ctx: GraphQLContext, revision: RevisionModel): Promise<VocabularyItemModel[]> {
  const annotations = await ctx.loaders.annotationsByRevision.load(revision.id);
  if (!annotations.length) return [];
  const texts = blockTexts(revision.richText as RichTextDocument);
  const blockOrder = new Map([...texts.keys()].map((id, i) => [id, i]));
  const ordered = [...annotations].sort(
    (a, b) => (blockOrder.get(a.blockId) ?? 0) - (blockOrder.get(b.blockId) ?? 0) || a.start - b.start
  );
  const groups = new Map<string, typeof ordered>();
  for (const a of ordered) groups.set(a.senseRevisionId, [...(groups.get(a.senseRevisionId) ?? []), a]);

  return Promise.all(
    [...groups.entries()].map(async ([senseRevisionId, spans]) => {
      const senseRevision = present(await ctx.loaders.senseRevision.load(senseRevisionId), "sense revision");
      const sense = present(await ctx.loaders.sense.load(senseRevision.senseId), "sense");
      return {
        sense: { sense, revision: senseRevision },
        isKey: spans.some((s) => s.isKey),
        occurrences: spans.map((s) => ({
          blockId: s.blockId,
          start: s.start,
          end: s.end,
          text: s.surfaceText,
          sentence: sentenceAround(texts.get(s.blockId) ?? s.surfaceText, s.start, s.end),
        })),
      };
    })
  );
}
