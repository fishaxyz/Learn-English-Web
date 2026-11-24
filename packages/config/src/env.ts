import { z } from "zod";

/** Thrown at startup when the environment is missing or has a malformed setting. Never includes the values. */
export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/**
 * Validates the environment against a schema once, at startup. Error messages name the variables but never
 * print their values, so a secret can't leak into logs.
 */
export function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message.split("\n")[0]}`)
    );
  }
  return result.data;
}

export const logLevel = z.enum(["debug", "info", "warn", "error"]).default("info");

export const nodeEnv = z.enum(["development", "test", "production"]).default("development");

/** A postgres:// or postgresql:// connection string. */
export const databaseUrl = z
  .string()
  .min(1)
  .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// or postgresql:// URL");

export const httpUrl = z
  .string()
  .min(1)
  .refine((v) => /^https?:\/\//.test(v), "must be an http:// or https:// URL");

export const port = z.coerce.number().int().min(1).max(65535);
