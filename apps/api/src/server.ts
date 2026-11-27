import { LESSON_PARTS } from "./modules/resources/checklist";
import { createServer } from "node:http";
import { createDatabase } from "@english/database";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { createRateLimiter } from "./modules/rate-limit";
import { publishedTrackLookup } from "./modules/media/published";
import { createLocalStorage } from "./modules/media/storage";
import { createRevalidator } from "./modules/revalidate";
import { elevenLabsCatalog, fakeCatalog } from "./modules/tts/voices";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, "api");
const database = createDatabase(env.DATABASE_URL, { applicationName: "api" });
const media = createLocalStorage({
  dir: env.MEDIA_DIR,
  publicBaseUrl: env.MEDIA_PUBLIC_BASE_URL,
  secret: env.MEDIA_SIGNING_SECRET,
  publishedTrack: publishedTrackLookup(database.db),
});
const { handler } = createApp(
  {
    db: database.db,
    log,
    ping: () => database.ping(),
    defaultSiteDomain: env.DEFAULT_SITE_DOMAIN,
    rateLimiter: createRateLimiter(),
    revalidator: createRevalidator({ urls: env.REVALIDATION_URLS, secret: env.REVALIDATION_SECRET, log }),
    trustProxy: env.TRUST_PROXY,
    storage: media.storage,
    mediaHandler: media.handle,
    // Every part of a reading lesson must be finished before it's reviewed or published.
    requiredParts: LESSON_PARTS,
    voices:
      env.ELEVENLABS_API_KEY && env.TTS_PROVIDER !== "fake" ? elevenLabsCatalog(env.ELEVENLABS_API_KEY) : fakeCatalog,
    workerToken: env.WORKER_SERVICE_TOKEN,
  },
  {
    corsOrigins: env.CORS_ORIGINS,
    graphiql: env.NODE_ENV === "development",
    production: env.NODE_ENV === "production",
  }
);

const server = createServer(handler);
server.listen(env.API_PORT, () => log.info({ port: env.API_PORT }, "listening"));

// Graceful shutdown: stop taking requests, let open ones finish, then close the pool.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "shutting down");
    server.close(async () => {
      await database.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
