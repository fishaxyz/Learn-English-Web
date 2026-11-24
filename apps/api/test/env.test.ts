import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

describe("API environment", () => {
  it("needs a database URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("splits CORS origins and defaults the port", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://x/y", CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
    expect(env.API_PORT).toBe(4400);
  });
});
