import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const DASHBOARD = process.env.DASHBOARD_URL ?? "http://localhost:3401";
export const WEBSITE = process.env.WEBSITE_URL ?? "http://localhost:3400";
export const MAILBOX = process.env.MAILBOX ?? ".dev-mailbox/sign-in-links.jsonl";
export const EDITOR = process.env.E2E_EDITOR ?? "owner@example.test"; // invited as OWNER: writes and reviews

/** The newest sign-in link sent to `to` after `since` (the dev mailbox stands in for email). */
async function signInLink(to: string, since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const lines = readFileSync(MAILBOX, "utf8").trim().split("\n").reverse();
    for (const line of lines) {
      const mail = JSON.parse(line) as { to: string; url: string; at: string };
      if (mail.to === to && Date.parse(mail.at) >= since) return mail.url;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("No sign-in link arrived");
}

/** Signs in to the dashboard with an emailed link (the dev mailbox stands in for email). */
export async function signIn(page: Page, email: string) {
  const asked = Date.now() - 1000;
  await page.goto(`${DASHBOARD}/sign-in`);
  await page.getByText("No password yet, or forgot it?").click();
  await page.getByLabel("Email for a sign-in link").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await signInLink(email, asked));
  await expect(page.getByRole("heading", { name: "Lessons" })).toBeVisible();
}

/** Invites a fresh editor through the real invite command, so each run starts from a clean account. */
export function inviteFreshEditor(role = "EDITOR"): string {
  const email = `e2e-${Date.now().toString(36)}@example.test`;
  execFileSync("pnpm", ["-s", "docker:invite", "--email", email, "--site", "localhost", "--role", role], {
    stdio: "ignore",
  });
  return email;
}
