import "server-only";
import { httpUrl, parseEnv } from "@english/config/env";
import { z } from "zod";

// Server-only settings (AGENTS.md §10: never NEXT_PUBLIC_ for anything private).
export const envSchema = z.object({
  GRAPHQL_API_URL: httpUrl,
});

let cached: z.output<typeof envSchema> | undefined;

/** Read at request time, not build time, so one image can run in any environment. */
export const serverEnv = () => (cached ??= parseEnv(envSchema, process.env));
