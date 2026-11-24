import "server-only";
import { databaseUrl, httpUrl, parseEnv } from "@english/config/env";
import { z } from "zod";

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

// Server-only settings (AGENTS.md §10: never NEXT_PUBLIC_ for anything private).
export const envSchema = z.object({
  GRAPHQL_API_URL: httpUrl,
  /** Auth.js stores sessions in the same database (its tables are part of our Drizzle schema). */
  DATABASE_URL: databaseUrl,
  /** Signs Auth.js's tokens. At least 32 random characters. */
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  /** development allows the local mailbox file instead of real email; production requires EMAIL_SERVER. */
  APP_ENV: z.enum(["development", "production"]).default("production"),
  /** SMTP URL for sign-in emails, e.g. smtps://user:pass@smtp.example.com:465. */
  EMAIL_SERVER: optional(z.string().min(1)),
  EMAIL_FROM: z.string().min(3).default("English Skills <no-reply@localhost>"),
  /** Development only: where sign-in links are written instead of emailed. */
  AUTH_DEV_MAILBOX: z.string().min(1).default(".dev-mailbox/sign-in-links.jsonl"),
  /** The public website, for "View on the site" links. */
  WEBSITE_URL: httpUrl.default("http://localhost:3400"),
  AUTH_GOOGLE_ID: optional(z.string().min(1)),
  AUTH_GOOGLE_SECRET: optional(z.string().min(1)),
});

let cached: z.output<typeof envSchema> | undefined;

/** Read at request time, not build time, so one image can run in any environment. */
export const serverEnv = () => (cached ??= parseEnv(envSchema, process.env));
