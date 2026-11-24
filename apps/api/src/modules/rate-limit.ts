import { AppError } from "../errors";

/**
 * Fixed-window rate limits per client, in this process's memory (AGENTS.md §6: rate-limit sensitive mutations
 * and public search). Enough for one API instance; a shared store (e.g. Postgres or Redis) is needed only once
 * there are several. Old windows are dropped as they expire, so memory stays bounded by active clients.
 */
export const RATE_LIMITS = {
  grade: { limit: 30, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function createRateLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = now();

  function sweep(t: number) {
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    for (const [key, w] of windows) {
      const name = key.split("|")[0] as RateLimitName;
      if (t - w.start >= RATE_LIMITS[name].windowMs) windows.delete(key);
    }
  }

  return {
    /** Counts one request; throws RATE_LIMITED once the client is over the limit for this window. */
    hit(name: RateLimitName, client: string) {
      const { limit, windowMs } = RATE_LIMITS[name];
      const t = now();
      sweep(t);
      const key = `${name}|${client}`;
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        return;
      }
      w.count += 1;
      if (w.count > limit) {
        const retryAfter = Math.ceil((w.start + windowMs - t) / 1000);
        throw new AppError("RATE_LIMITED", `Too many requests; try again in ${retryAfter} s`, { retryAfter });
      }
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * The client a request is for. Behind the website's server, the real visitor's address arrives in
 * x-forwarded-for, which is only believed when TRUST_PROXY is on (the API isn't exposed to the internet directly).
 */
export function clientOf(forwardedFor: string | null, remoteAddress: string | undefined, trustProxy: boolean): string {
  const forwarded = trustProxy ? forwardedFor?.split(",")[0]?.trim() : undefined;
  return (forwarded || remoteAddress || "unknown").slice(0, 64);
}
