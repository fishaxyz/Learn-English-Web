import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (memory-hard, OWASP-recommended; no extra dependency).
 * Stored as "scrypt$N$r$p$salt$hash", so the cost can be raised later without breaking old hashes.
 * Nothing here logs or returns a password.
 */
const COST = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

const scrypt = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEMORY });
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash that never matches, checked when there's no account, so a wrong email takes as long as a wrong password. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(24).toString("base64")));

/** What's wrong with a new password, in words for the person choosing it, or null. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (password.trim() !== password) return "Don't start or end with a space.";
  const name = email.toLowerCase().split("@")[0] ?? "";
  if (name.length >= 3 && password.toLowerCase().includes(name)) return "Don't use your email address in it.";
  if (new Set(password).size < 5) return "Use a less repetitive password.";
  return null;
}

/** After 5 wrong passwords in a row, the account is locked for 15 minutes (email links still work). */
export const LOCKOUT = { attempts: 5, minutes: 15 };

export function afterFailure(failedAttempts: number, now: Date) {
  const failed = failedAttempts + 1;
  return failed >= LOCKOUT.attempts
    ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT.minutes * 60_000) }
    : { failedAttempts: failed, lockedUntil: null };
}
