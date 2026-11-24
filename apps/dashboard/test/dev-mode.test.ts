import { describe, expect, it } from "vitest";
import { devModeAllowed } from "../lib/dev-mode";

describe("development sign-in", () => {
  it("is only on in development, on localhost", () => {
    expect(devModeAllowed({ APP_ENV: "development", AUTH_URL: "http://localhost:3401" })).toBe(true);
    expect(devModeAllowed({ APP_ENV: "development", AUTH_URL: "http://127.0.0.1:3401" })).toBe(true);
  });

  it("is never on for a real address, or outside development", () => {
    expect(devModeAllowed({ APP_ENV: "production", AUTH_URL: "http://localhost:3401" })).toBe(false);
    expect(devModeAllowed({ APP_ENV: "development", AUTH_URL: "https://admin.example.com" })).toBe(false);
    expect(devModeAllowed({ APP_ENV: "development", AUTH_URL: "http://localhost.example.com" })).toBe(false);
    expect(devModeAllowed({ APP_ENV: "development", AUTH_URL: "not a url" })).toBe(false);
  });
});
