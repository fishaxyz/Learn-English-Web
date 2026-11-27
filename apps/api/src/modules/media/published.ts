import { schema, type Database } from "@english/database";
import { and, eq, isNull } from "drizzle-orm";
import type { PublishedTrackLookup } from "./storage";

/**
 * The file behind a lasting audio link: the track must belong to the version its lesson currently publishes, in a
 * lesson that isn't archived. A new version, unpublishing or archiving makes the old link stop working.
 */
export function publishedTrackLookup(db: Database): PublishedTrackLookup {
  const { audioTracks: track, mediaAssets: asset, resourceLocalizations: loc, resources } = schema;
  return async (trackId) => {
    const [row] = await db
      .select({ key: asset.objectKey })
      .from(track)
      .innerJoin(asset, and(eq(asset.id, track.assetId), eq(asset.siteId, track.siteId)))
      .innerJoin(loc, and(eq(loc.publishedRevisionId, track.revisionId), eq(loc.siteId, track.siteId)))
      .innerJoin(resources, eq(resources.id, loc.resourceId))
      .where(and(eq(track.id, trackId), isNull(resources.archivedAt)))
      .limit(1);
    return row?.key ?? null;
  };
}
