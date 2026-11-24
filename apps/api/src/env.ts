import { databaseUrl, logLevel, nodeEnv, parseEnv, port } from "@english/config/env";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  DATABASE_URL: databaseUrl,
  API_PORT: port.default(4400),
  /** The site a request is for when it doesn't send x-site-domain. */
  DEFAULT_SITE_DOMAIN: z.string().trim().toLowerCase().min(1).default("localhost"),
  /** Browser origins allowed to call the API, comma-separated. Server-to-server calls don't need it. */
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
});

export type ApiEnv = z.output<typeof schema>;

export const loadEnv = (source: Record<string, string | undefined> = process.env): ApiEnv => parseEnv(schema, source);
