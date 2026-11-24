import { LessonListDocument, SiteTopicsDocument, type LessonListQuery } from "@english/graphql";
import type { MetadataRoute } from "next";
import { publicQuery } from "../lib/api";
import { serverEnv } from "../lib/env";
import { LEVELS } from "../lib/levels";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

/** Published pages only; drafts are never reachable here (AGENTS.md §7). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = serverEnv().SITE_URL;
  const url = (path: string) => new URL(path, base).toString();
  const lessons: { slug: string; publishedAt: string }[] = [];
  let after: string | null = null;
  // At most 20 pages of 50: plenty for now; split the sitemap when the library grows past it.
  for (let page = 0; page < 20; page++) {
    const data: LessonListQuery = await publicQuery(LessonListDocument, {
      first: 50,
      after,
      filter: { kind: "READING" },
    });
    lessons.push(...data.publishedResources.nodes);
    if (!data.publishedResources.pageInfo.hasNextPage) break;
    after = data.publishedResources.pageInfo.endCursor;
  }
  const topics = (await publicQuery(SiteTopicsDocument, {}, ["topics"])).topics;
  return [
    { url: url("/"), changeFrequency: "daily" },
    { url: url("/reading"), changeFrequency: "daily" },
    ...LEVELS.map((l) => ({ url: url(`/levels/${l.toLowerCase()}`) })),
    ...topics.map((t) => ({ url: url(`/topics/${t.slug}`) })),
    ...lessons.map((l) => ({ url: url(`/reading/${l.slug}`), lastModified: l.publishedAt })),
  ];
}
