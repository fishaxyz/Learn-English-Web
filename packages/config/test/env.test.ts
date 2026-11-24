import { describe, expect, it } from "vitest";
import { z } from "zod";
import { databaseUrl, EnvError, parseEnv, port } from "../src/env";

describe("parseEnv", () => {
  const schema = z.object({ DATABASE_URL: databaseUrl, PORT: port.default(4400) });

  it("returns typed values and applies defaults", () => {
    expect(parseEnv(schema, { DATABASE_URL: "postgres://localhost/db" })).toEqual({
      DATABASE_URL: "postgres://localhost/db",
      PORT: 4400,
    });
  });

  it("names every bad variable without printing its value", () => {
    const secret = "mysql://user:s3cret@host/db";
    try {
      parseEnv(schema, { DATABASE_URL: secret, PORT: "99999" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PORT");
      expect(message).not.toContain("s3cret");
    }
  });
});
