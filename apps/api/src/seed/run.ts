// `pnpm --filter @english/api seed`: sample content for local development. Never run it against production.
import { databaseUrl, parseEnv } from "@english/config/env";
import { createDatabase } from "@english/database";
import { z } from "zod";
import { seed } from "./seed";

const env = parseEnv(
  z.object({
    DATABASE_URL: databaseUrl,
    NODE_ENV: z.string().default("development"),
    SEED_SITE_DOMAIN: z.string().trim().toLowerCase().default("localhost"),
  }),
  process.env
);
if (env.NODE_ENV === "production") {
  console.error("Refusing to seed sample content with NODE_ENV=production.");
  process.exit(1);
}

const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "seed" });
try {
  const result = await seed(database.db, env.SEED_SITE_DOMAIN);
  console.log(
    JSON.stringify({
      level: "info",
      service: "seed",
      msg: result.created
        ? "sample content created"
        : "linked" in result && result.linked
          ? `site exists; updated ${result.linked} sample item(s)`
          : "site already exists; nothing changed",
      domain: env.SEED_SITE_DOMAIN,
    })
  );
} finally {
  await database.close();
}
