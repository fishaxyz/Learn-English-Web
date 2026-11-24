import type { Database } from "@english/database";
import { MemoryLogWriter } from "graphql-yoga";
import type { ApiDependencies } from "../src/context";
import { createLogger } from "../src/logger";
import { createRateLimiter } from "../src/modules/rate-limit";
import { createRevalidator } from "../src/modules/revalidate";

/** Everything createApp needs, quiet and offline, with any part overridden. */
export function testDeps(overrides: Partial<ApiDependencies> & { db: Database }): ApiDependencies {
  const log = createLogger("error", "test", [new MemoryLogWriter()]);
  return {
    log,
    ping: async () => true,
    defaultSiteDomain: "a.test",
    rateLimiter: createRateLimiter(),
    revalidator: createRevalidator({ urls: [], secret: undefined, log }),
    trustProxy: false,
    ...overrides,
  };
}
