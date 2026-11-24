import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Phase 2's acceptance test (AGENTS.md §13): an editor signs in, writes a reading lesson with a vocabulary
// link and an exercise, it's reviewed and published, and a learner reads it, opens the word and is graded.
const DASHBOARD = process.env.DASHBOARD_URL ?? "http://localhost:3401";
const WEBSITE = process.env.WEBSITE_URL ?? "http://localhost:3400";
const MAILBOX = process.env.MAILBOX ?? ".dev-mailbox/sign-in-links.jsonl";
const EDITOR = process.env.E2E_EDITOR ?? "owner@example.test"; // invited as OWNER: writes and reviews

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

test("an editor publishes a reading lesson and a learner uses it", async ({ page }) => {
  page.on("console", (m) => {
    if (m.type() === "error") console.log("browser error:", m.text());
  });
  page.on("pageerror", (e) => console.log("page error:", e.message));
  const slug = `e2e-${Date.now().toString(36)}`;
  const title = `Late Again ${slug.slice(4)}`;

  // Sign in with an emailed link.
  const asked = Date.now() - 1000;
  await page.goto(`${DASHBOARD}/sign-in`);
  await page.getByLabel("Email address").fill(EDITOR);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await signInLink(EDITOR, asked));
  await expect(page.getByRole("heading", { name: "Lessons" })).toBeVisible();

  // A new reading lesson.
  await page.getByRole("link", { name: "New lesson" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Level").selectOption("A2");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Text, with "commute" linked to its meaning.
  const text = page.getByLabel("Lesson text");
  await text.click();
  await page.keyboard.type("Her commute is long.");
  // Select "commute" the way a mouse would: a DOM selection, which the editor follows.
  await text.evaluate((el) => {
    const node = el.querySelector("p")?.firstChild;
    if (!node) throw new Error("no text");
    const start = (node.textContent ?? "").indexOf("commute");
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + "commute".length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole("button", { name: "Link word to its meaning" }).click();
  await page
    .getByRole("region", { name: "Link a word to its meaning" })
    .getByRole("button", { name: /commute/ })
    .click();
  await expect(page.getByRole("complementary").getByText("commute", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Travel" }).check();
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByRole("button", { name: "Text saved" })).toBeVisible();

  // One exercise.
  await page.getByRole("button", { name: "Add an exercise set" }).click();
  await page.getByRole("button", { name: "True / False / Not given" }).click();
  await page.getByLabel("Statement").fill("Her commute is short.");
  await page.getByLabel("Answer").selectOption("FALSE");
  await page.getByRole("button", { name: "Save exercises" }).click();
  await expect(page.getByRole("button", { name: "Exercises saved" })).toBeVisible();

  // Still private while it's a draft.
  expect((await page.request.get(`${WEBSITE}/reading/${slug}`)).status()).toBe(404);

  // Review and publish.
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Sent for review.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  // The page refreshes into its published state (the draft is gone; revision 1 is live).
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  // A learner reads it, opens the word, and answers.
  await page.goto(`${WEBSITE}/reading/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await page.getByRole("button", { name: "commute" }).click();
  await expect(page.getByRole("dialog", { name: "Meaning of commute" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "False" }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByText("You scored 1 out of 1.")).toBeVisible();
});
