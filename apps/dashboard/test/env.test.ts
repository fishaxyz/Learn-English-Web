import { parseEnv } from "@english/config/env";
import { describe, expect, it } from "vitest";
import { envSchema } from "../lib/env";

const valid = {
  GRAPHQL_API_URL: "http://api:4400",
  DATABASE_URL: "postgres://u:p@db/x",
  AUTH_SECRET: "x".repeat(32),
};

describe("dashboard environment", () => {
  it("needs the API, the database and a long sign-in secret", () => {
    expect(() => parseEnv(envSchema, {})).toThrow(/GRAPHQL_API_URL/);
    expect(() => parseEnv(envSchema, { ...valid, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv(envSchema, { ...valid, GRAPHQL_API_URL: "ftp://api" })).toThrow(/GRAPHQL_API_URL/);
  });

  it("defaults to production, where sign-in links must be emailed", () => {
    const env = parseEnv(envSchema, { ...valid, EMAIL_SERVER: "" });
    expect(env.APP_ENV).toBe("production");
    expect(env.EMAIL_SERVER).toBeUndefined();
  });
});
