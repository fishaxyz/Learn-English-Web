import { Logger, type LogLevel } from "graphql-yoga";

export type { Logger };

/**
 * The API's structured logger (AGENTS.md §11): Yoga's own logger, so request logs and ours share one format.
 * Set LOG_JSON=1 for one JSON object per line (as Docker does). Secret-looking fields are redacted.
 */
export function createLogger(
  level: LogLevel | false,
  service: string,
  writers?: NonNullable<ConstructorParameters<typeof Logger>[0]>["writers"]
): Logger {
  return new Logger({
    level,
    attrs: { service },
    redact: ["password", "token", "secret", "authorization", "cookie", "databaseUrl"],
    ...(writers ? { writers } : {}),
  });
}
