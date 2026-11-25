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
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
}

/** Invites a fresh editor through the real invite command, so each run starts from a clean account. */
export function inviteFreshEditor(role = "EDITOR"): string {
  const email = `e2e-${Date.now().toString(36)}@example.test`;
  execFileSync("pnpm", ["-s", "docker:invite", "--email", email, "--site", "localhost", "--role", role], {
    stdio: "ignore",
  });
  return email;
}

/** Selects `word` in the lesson text the way a mouse would, and links it to its first meaning in the word bank. */
export async function linkWord(page: Page, word: string) {
  const text = page.getByLabel("Lesson text");
  await text.click(); // the editor follows the selection only while it has focus
  await text.evaluate((el, w) => {
    for (const p of el.querySelectorAll("p")) {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const start = (node.textContent ?? "").indexOf(w);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + w.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
    }
    throw new Error(`"${w}" isn't in the text`);
  }, word);
  await page.getByRole("button", { name: "Link word to its meaning" }).click();
  await page
    .getByRole("region", { name: "Link a word to its meaning" })
    .getByRole("button", { name: new RegExp(word) })
    .first()
    .click();
  await expect(page.locator("#vocabulary").getByText(word, { exact: true })).toBeVisible();
}

/** Adds one True/False/Not given question and saves the exercises. */
export async function addQuestion(page: Page, statement: string, answer: "TRUE" | "FALSE" | "NOT_GIVEN") {
  await page.getByRole("button", { name: "Add an exercise set" }).click();
  await page.getByRole("button", { name: "True / False / Not given" }).click();
  await page.getByLabel("Statement").fill(statement);
  await page.getByLabel("Answer").selectOption(answer);
  await page.getByRole("button", { name: "Save exercises" }).click();
  await expect(page.getByRole("button", { name: "Exercises saved" })).toBeVisible();
}

/**
 * Makes a voice-over with the first test voice and approves it. The end-to-end stack runs with TTS_PROVIDER=fake,
 * so the voice is silent and nothing is spent.
 */
export async function makeTestVoiceover(page: Page) {
  const voice = page.locator("#voice");
  await voice.locator('input[type="checkbox"][id^="voice-"]').first().check();
  page.once("dialog", (d) => void d.accept());
  await voice.getByRole("button", { name: "Make voice-over" }).click();
  await approveWhenReady(page);
}

/** Waits for the worker to finish the voice-over (it polls every few seconds), then approves it. */
export async function approveWhenReady(page: Page) {
  const voice = page.locator("#voice");
  await expect(voice.getByText("Ready to check")).toBeVisible({ timeout: 60_000 });
  await voice.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(voice.getByText("Approved", { exact: true })).toBeVisible();
}
