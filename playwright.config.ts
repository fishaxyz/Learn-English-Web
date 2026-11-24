import { defineConfig } from "@playwright/test";

// End-to-end tests against the running stack (`pnpm docker:up`, seeded, with an invited owner).
// Uses the installed Google Chrome, so no browser download is needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  // One at a time: the tests share one account and the dev mailbox, and a sign-in link works once.
  workers: 1,
  reporter: [["list"]],
  use: { channel: "chrome", trace: "retain-on-failure" },
});
