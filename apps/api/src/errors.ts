import { GraphQLError } from "graphql";

/** The error codes clients can rely on (AGENTS.md §6). Anything else reaches them only as "Unexpected error." */
export type ErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND" | "RATE_LIMITED";

const CODES = new Set<string>([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "CONFLICT",
  "NOT_FOUND",
  "RATE_LIMITED",
]);

export class AppError extends GraphQLError {
  /** Marks errors the API raised on purpose: their message and code are safe to show clients. */
  readonly clientSafe = true;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, { extensions: { code, ...(details ? { details } : {}) } });
  }
}

/**
 * Whether an error (or what it wraps) is one we raised on purpose. Checked by shape, not `instanceof`: the
 * graphql library can be loaded twice (ESM and CommonJS), and then instanceof gives the wrong answer.
 */
export function isClientSafe(error: unknown): boolean {
  for (
    let e = error as { clientSafe?: unknown; extensions?: { code?: unknown }; originalError?: unknown } | undefined;
    e;
    e = e.originalError as typeof e
  ) {
    if (e.clientSafe === true && typeof e.extensions?.code === "string" && CODES.has(e.extensions.code)) return true;
  }
  return false;
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const invalid = (message: string, details?: Record<string, unknown>) =>
  new AppError("VALIDATION_ERROR", message, details);

/** Postgres error codes the services translate (never their messages: those can mention table names). */
export function pgCode(error: unknown): string | undefined {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

/** Runs a write; turns unique and immutability violations into CONFLICT, foreign key ones into VALIDATION_ERROR. */
export async function translateDbErrors<T>(work: () => Promise<T>, messages: { unique?: string } = {}): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = pgCode(error);
    if (code === "23505") throw conflict(messages.unique ?? "That already exists");
    if (code === "23001") throw conflict("Published revisions can't be changed");
    if (code === "23503") throw invalid("A referenced item doesn't exist on this site");
    if (code === "23514") throw invalid("A value is out of range or badly formatted");
    throw error;
  }
}
