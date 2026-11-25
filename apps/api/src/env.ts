import { databaseUrl, logLevel, nodeEnv, parseEnv, port } from "@english/config/env";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  DATABASE_URL: databaseUrl,
  API_PORT: port.default(4400),
  /** The site a request is for when it doesn't send x-site-domain. */
  DEFAULT_SITE_DOMAIN: z.string().trim().toLowerCase().min(1).default("localhost"),
  /** Believe x-forwarded-for for rate limits. Only behind our own website server or proxy. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Website endpoints to notify after a publish, comma-separated; and the secret they expect. */
  REVALIDATION_URLS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  REVALIDATION_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "must be at least 32 characters").optional()
  ),
  /** Media files: the local driver keeps them in this folder and serves signed URLs at this address. */
  MEDIA_DIR: z.string().min(1).default(".media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().default("http://localhost:4400"),
  MEDIA_SIGNING_SECRET: z.string().min(32, "must be at least 32 characters"),
  /** Shared with the Python worker; worker operations are refused without it. */
  WORKER_SERVICE_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "must be at least 32 characters").optional()
  ),
  /** Lists voices for editors. Without it, test voices are offered and the worker makes silent audio. */
  ELEVENLABS_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(10).optional()),
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
