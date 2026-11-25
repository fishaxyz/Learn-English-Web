import type { Database } from "@english/database";
import { MemoryLogWriter } from "graphql-yoga";
import type { ApiDependencies } from "../src/context";
import { createLogger } from "../src/logger";
import { createRateLimiter } from "../src/modules/rate-limit";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage } from "../src/modules/media/storage";
import { createRevalidator } from "../src/modules/revalidate";
import { fakeCatalog } from "../src/modules/tts/voices";

/** Everything createApp needs, quiet and offline, with any part overridden. */
/** The worker's token in tests (a placeholder, not a secret). */
export const TEST_WORKER_TOKEN = "test-worker-token-0123456789-abcdef";

export function testDeps(overrides: Partial<ApiDependencies> & { db: Database }): ApiDependencies {
  const log = createLogger("error", "test", [new MemoryLogWriter()]);
  const media = createLocalStorage({
    dir: mkdtempSync(join(tmpdir(), "media-test-")),
    publicBaseUrl: "http://media.test",
    secret: "test-media-signing-secret-0123456789",
  });
  return {
    log,
    ping: async () => true,
    defaultSiteDomain: "a.test",
    rateLimiter: createRateLimiter(),
    revalidator: createRevalidator({ urls: [], secret: undefined, log }),
    trustProxy: false,
    storage: media.storage,
    mediaHandler: media.handle,
    voices: fakeCatalog,
    workerToken: TEST_WORKER_TOKEN,
    ...overrides,
  };
}
