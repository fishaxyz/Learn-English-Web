import { describe, expect, it } from "vitest";
import { afterFailure, hashPassword, LOCKOUT, passwordProblem, verifyPassword } from "../lib/passwords";

describe("passwords", () => {
  it("hashes with a fresh salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b); // salted
    expect(a).not.toContain("correct");
    expect(a.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("says plainly what's wrong with a weak password", () => {
    expect(passwordProblem("short", "a@x.test")).toMatch(/10 characters/);
    expect(passwordProblem("aaaaaaaaaaaa", "a@x.test")).toMatch(/repetitive/);
    expect(passwordProblem("my-name-is-mia-123", "mia@x.test")).toMatch(/email/);
    expect(passwordProblem("Tea at seven, rain later", "abc@gmail.com")).toBeNull();
  });

  it("locks for 15 minutes after 5 wrong tries in a row", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(afterFailure(0, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
    const locked = afterFailure(LOCKOUT.attempts - 1, now);
    expect(locked.failedAttempts).toBe(0);
    expect(locked.lockedUntil?.toISOString()).toBe("2026-01-01T10:15:00.000Z");
  });
});
