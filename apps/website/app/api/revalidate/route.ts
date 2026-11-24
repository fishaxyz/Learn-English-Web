import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { serverEnv } from "../../../lib/env";

export const dynamic = "force-dynamic";

const TAG = /^[a-z]+(:[A-Z_]+:[a-z0-9-]+)?$/;

function authorized(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called by the API after a publish or archive (AGENTS.md §7). Expires the named cache tags at once, so the
 * next visitor sees the change; nothing is served from the old cache.
 */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"), serverEnv().REVALIDATION_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let tags: unknown;
  try {
    tags = ((await request.json()) as { tags?: unknown }).tags;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > 50 ||
    !tags.every((t) => typeof t === "string" && TAG.test(t))
  ) {
    return Response.json({ error: "invalid tags" }, { status: 400 });
  }
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags.length });
}
