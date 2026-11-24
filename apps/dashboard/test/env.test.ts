import { describe, expect, it } from "vitest";
import { parseEnv } from "@english/config/env";
import { envSchema } from "../lib/env";

describe("server environment", () => {
  it("needs an http(s) API URL", () => {
    expect(() => parseEnv(envSchema, {})).toThrow(/GRAPHQL_API_URL/);
    expect(() => parseEnv(envSchema, { GRAPHQL_API_URL: "ftp://api" })).toThrow(/GRAPHQL_API_URL/);
    expect(parseEnv(envSchema, { GRAPHQL_API_URL: "http://api:4400" }).GRAPHQL_API_URL).toBe("http://api:4400");
  });
});
