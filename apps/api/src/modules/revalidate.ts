import type { Logger } from "../logger";

/**
 * Tells the website which cached pages changed after a publish or archive (AGENTS.md §7). Runs in the
 * background, so the editor's request doesn't wait; retries with backoff, and logs when it finally gives up.
 * The website also re-checks its cache every few minutes, so a missed notice delays an update, never loses it.
 */
export function createRevalidator(
  options: { urls: string[]; secret: string | undefined; log: Logger; delaysMs?: number[] },
  send: typeof fetch = fetch
) {
  const delays = options.delaysMs ?? [0, 1_000, 5_000, 30_000];

  async function notifyOne(url: string, tags: string[]) {
    for (const [attempt, delay] of delays.entries()) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await send(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${options.secret}` },
          body: JSON.stringify({ tags }),
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return true;
        options.log.warn({ status: res.status, attempt }, "revalidation refused");
      } catch (error) {
        options.log.warn({ attempt, reason: (error as Error).name }, "revalidation failed");
      }
    }
    options.log.error({ tags }, "revalidation gave up; pages refresh on their own schedule");
    return false;
  }

  return {
    /** Fire and forget. Resolves when every target has answered or given up (awaited in tests only). */
    notify(tags: string[]): Promise<boolean[]> {
      if (!options.secret || options.urls.length === 0) return Promise.resolve([]);
      return Promise.all(options.urls.map((u) => notifyOne(u, tags)));
    },
  };
}

export type Revalidator = ReturnType<typeof createRevalidator>;

/** The cache tags a resource's pages use, shared with the website. */
export const tagsForResource = (kind: string, slug: string) => ["resources", `resource:${kind}:${slug}`];
