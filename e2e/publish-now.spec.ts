import { expect, test } from "@playwright/test";
import { addQuestion, DASHBOARD, EDITOR, linkWord, makeTestVoiceover, signIn, WEBSITE } from "./helpers";

// An admin (here the owner) writes an essay and publishes it in one step, without the review queue.
test("an admin publishes an essay with Publish now", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = `essay-${Date.now().toString(36)}`;
  const title = `Morning Routines ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Many people drink coffee before their commute. Others go for a run.");
  await linkWord(page, "commute");
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByRole("button", { name: "Text saved" })).toBeVisible();

  // Saved, but not finished: Publish now waits for the voice-over and the questions.
  await expect(page.getByRole("button", { name: "Publish now" })).toBeDisabled();
  await makeTestVoiceover(page);
  await addQuestion(page, "Everyone goes for a run.", "FALSE");

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Many people drink coffee before their commute.")).toBeVisible();
  await expect(page.getByRole("button", { name: "▶ Listen" })).toBeVisible();
});
