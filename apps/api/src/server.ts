import { createServer } from "node:http";
import { createDatabase } from "@english/database";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { createRateLimiter } from "./modules/rate-limit";
import { createRevalidator } from "./modules/revalidate";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, "api");
const database = createDatabase(env.DATABASE_URL, { applicationName: "api" });
const { handler } = createApp(
  {
    db: database.db,
    log,
    ping: () => database.ping(),
    defaultSiteDomain: env.DEFAULT_SITE_DOMAIN,
    rateLimiter: createRateLimiter(),
    revalidator: createRevalidator({ urls: env.REVALIDATION_URLS, secret: env.REVALIDATION_SECRET, log }),
    trustProxy: env.TRUST_PROXY,
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
