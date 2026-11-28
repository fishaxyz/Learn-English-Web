import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, makeTestVoiceover, saveAndEdit, signIn, WEBSITE } from "./helpers";

const fixture = (name: string) => ({
  name,
  mimeType: "text/plain",
  buffer: readFileSync(join(__dirname, "../apps/dashboard/test/fixtures", name)),
});

// A lesson from its three files (ADR 0012): the script, the questions with their answer key, and the vocabulary
// sheet. Each is read in the browser into the editor's own fields; the editor checks and saves as usual.
test("an editor makes a lesson from its script, questions and vocabulary files", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `files-${Date.now().toString(36)}`;
  const title = `Files ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  // The script: paragraphs without letters or bold marks; the empty summary is filled, the title kept.
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel("Choose a script file (.txt or .docx)").setInputFiles(fixture("vanishing-dark-reading.txt"));
  await expect(
    page.getByText(
      "Read 7 paragraphs from “vanishing-dark-reading.txt” (and the summary). Check the text, then save it."
    )
  ).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.getByLabel("Summary")).toHaveValue("How artificial light at night is reshaping the natural world");
  const text = page.getByLabel("Lesson text");
  await expect(text).toContainText("For most of the Earth's history");
  await expect(text).not.toContainText("**");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // The questions: three sets, answers from the key.
  await page
    .getByLabel("Choose a questions file (.txt or .docx)")
    .setInputFiles(fixture("vanishing-dark-questions.txt"));
  await expect(
    page.getByText("Read 13 questions in 3 sets from “vanishing-dark-questions.txt”. Check them, then save.")
  ).toBeVisible();
  await expect(page.getByLabel("Set title").nth(2)).toHaveValue("Questions 10–13: Reducing light pollution");
  await page.getByRole("button", { name: "Save exercises" }).click();
  await expect(page.getByRole("button", { name: "Exercises saved" })).toBeVisible();

  // The vocabulary sheet.
  const section = page.locator("#vocabulary");
  await section.getByLabel("Choose a file (.txt or .docx)").setInputFiles(fixture("vanishing-dark-vocabulary.txt"));
  await section.getByRole("button", { name: "Add the sheet" }).click();
  await expect(section.getByText("Added 30 items.")).toBeVisible();
  await section.getByRole("button", { name: "✓ Approve all drafts (30)" }).click();
  await expect(section.getByText("30 approved · 0 to check")).toBeVisible();

  await makeTestVoiceover(page);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  // Learners: three sets (4 + 5 + 4 marks); the summary's explanations show after checking.
  await page.goto(`${WEBSITE}/reading/${slug}`);
  await page.getByRole("tab", { name: /^Questions/ }).click();
  await expect(page.getByRole("button", { name: "Check answers" })).toHaveCount(3);
  await page.getByRole("button", { name: "Check answers" }).nth(2).click();
  await expect(page.getByText("You scored 0 out of 4.")).toBeVisible();
  await expect(page.getByText(/chấp nhận cả “downward”/)).toBeVisible();
});
