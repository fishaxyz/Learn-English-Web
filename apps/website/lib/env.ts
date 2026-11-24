import "server-only";
import { httpUrl, parseEnv } from "@english/config/env";
import { z } from "zod";

// Server-only settings (AGENTS.md §10: never NEXT_PUBLIC_ for anything private).
export const envSchema = z.object({
  GRAPHQL_API_URL: httpUrl,
  /** Which site this website is: sent to the API as x-site-domain (the trusted domain mapping, AGENTS.md §7). */
  SITE_DOMAIN: z.string().trim().toLowerCase().min(1).default("localhost"),
  /** The public address, for canonical links and the sitemap. */
  SITE_URL: httpUrl.default("http://localhost:3400"),
  /** Shared with the API, which uses it to ask for cached pages to be refreshed after a publish. */
  REVALIDATION_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "must be at least 32 characters").optional()
  ),
});

let cached: z.output<typeof envSchema> | undefined;

/** Read at request time, not build time, so one image can run in any environment. */
export const serverEnv = () => (cached ??= parseEnv(envSchema, process.env));

/** The public address alone: safe at build time, when the rest of the settings may not be there yet. */
export const siteUrl = () => process.env.SITE_URL || "http://localhost:3400";
