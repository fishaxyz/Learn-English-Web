import { expect, test } from "@playwright/test";
import { approveWhenReady, DASHBOARD, EDITOR, linkWord, signIn, saveAndEdit } from "./helpers";

// The New lesson page has the same four parts as the lesson page. A lesson filled in completely there (script with a
// linked word, a question, a test voice-over) only needs its voice-over approved before it can be published.
test("an editor fills in all four parts on the New lesson page and publishes after approving", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = `complete-${Date.now().toString(36)}`;
  const title = `Complete ${slug.slice(9)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  // Script, vocabulary and questions on the left; the voice-over in the side panel.
  for (const part of ["Script", "Voice-over", "Lexical vocabulary", "Questions & quizzes"]) {
    await expect(page.getByRole("region", { name: part })).toBeVisible();
  }
  await expect(page.getByRole("complementary").getByRole("region", { name: "Voice-over" })).toBeVisible();

  // 1. Script, with a linked word.
  await page.getByLabel("Title").fill(title);
  await expect(page.getByLabel("Web address")).toHaveValue(slugOf(title));
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Level").selectOption("A2");
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute is long.");
  await linkWord(page, "commute");

  // 2. A voice-over (the free test voice), made right after creating.
  await page.locator("#voice").locator('input[type="checkbox"][id^="voice-"]').first().check();

  // 4. A question, saved with the lesson.
  await page.getByRole("button", { name: "Add an exercise set" }).click();
  await page.getByRole("button", { name: "True / False / Not given" }).click();
  await page.getByLabel("Statement").fill("Her commute is short.");
  await page.getByLabel("Answer").selectOption("FALSE");

  page.once("dialog", (d) => void d.accept());
  await saveAndEdit(page, title);
  await expect(page.getByRole("button", { name: /Questions & quizzes 1 set · 1 question Done/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lexical vocabulary 1 item linked/ })).toBeVisible();

  await approveWhenReady(page);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();
});

const slugOf = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
