import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, linkWord, makeTestVoiceover, saveAndEdit, signIn, WEBSITE } from "./helpers";

// An editor writes IELTS-style questions by hand (choose TWO letters; a short answer with a word limit), publishes,
// and a learner answers: one mark per correct letter, and an answer over the word limit is wrong.
test("IELTS question types are edited, published and marked", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `ielts-${Date.now().toString(36)}`;
  const title = `IELTS ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Make it now").uncheck();
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute takes forty minutes. She reads a book and listens to music on the train.");
  await linkWord(page, "commute");
  await saveAndEdit(page, title);
  await makeTestVoiceover(page);

  const questions = page.locator("#questions");
  await questions.getByRole("button", { name: "Add an exercise set" }).click();
  await questions.getByRole("button", { name: "Multiple choice (choose more)" }).click();
  await questions.getByLabel("Question", { exact: true }).fill("Which TWO things does she do on the train?");
  const choices = ["She sleeps.", "She reads a book.", "She works.", "She listens to music.", "She eats."];
  for (const [i, text] of choices.entries()) {
    await questions
      .getByLabel(`Choices (tick every correct one; learners choose that many) ${String.fromCharCode(65 + i)}`)
      .fill(text);
  }
  // Correct: B and D (the new question starts with A and B ticked).
  await questions.getByLabel("Choice A is correct").uncheck();
  await questions.getByLabel("Choice D is correct").check();
  await questions.getByRole("button", { name: "Short answer" }).click();
  await questions.getByLabel("Question", { exact: true }).last().fill("How long is her commute?");
  await questions.getByLabel("Accepted answers").fill("forty minutes | 40 minutes");
  await questions.getByRole("button", { name: "Save exercises" }).click();
  await expect(questions.getByRole("button", { name: "Exercises saved" })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  // The questions have their own tab, next to the article and its vocabulary.
  await expect(page.getByText("(Choose 2 letters.)")).toBeHidden();
  await page.getByRole("tab", { name: /^Questions/ }).click();
  await expect(page.getByText("(Choose 2 letters.)")).toBeVisible();
  await page.getByRole("checkbox", { name: "B She reads a book." }).check();
  await page.getByRole("checkbox", { name: "C She works." }).check();
  // Only two letters can be chosen.
  await expect(page.getByRole("checkbox", { name: "D She listens to music." })).toBeDisabled();
  await page.getByLabel(/How long is her commute\?/).fill("about forty long minutes");
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByText("You scored 1 out of 3.")).toBeVisible(); // B right, C wrong; the answer is too long
  await expect(page.getByText(/1 of 2 marks/)).toBeVisible();
});
