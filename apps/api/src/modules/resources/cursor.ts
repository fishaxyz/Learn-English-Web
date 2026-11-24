import { invalid } from "../../errors";

/** Opaque cursor for "newest first" lists: the last item's publish time and id (a stable, unique order). */
export type Cursor = { publishedAt: Date; id: string };

export const encodeCursor = (c: Cursor) =>
  Buffer.from(JSON.stringify([c.publishedAt.toISOString(), c.id])).toString("base64url");

export function decodeCursor(raw: string): Cursor {
  try {
    const [at, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as [string, string];
    const publishedAt = new Date(at);
    if (Number.isNaN(publishedAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("bad");
    return { publishedAt, id };
  } catch {
    throw invalid("Invalid cursor");
  }
}

export const MAX_PAGE = 50;

export function pageSize(first: number): number {
  if (!Number.isInteger(first) || first < 1 || first > MAX_PAGE) throw invalid(`first must be 1 to ${MAX_PAGE}`);
  return first;
}
