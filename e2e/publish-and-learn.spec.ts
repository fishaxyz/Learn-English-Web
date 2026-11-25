import { expect, test } from "@playwright/test";

// Phase 2's acceptance test (AGENTS.md §13): an editor signs in, writes a reading lesson with a vocabulary
// link and an exercise, it's reviewed and published, and a learner reads it, opens the word and is graded.
import { addQuestion, EDITOR, linkWord, makeTestVoiceover, signIn, WEBSITE, saveAndEdit } from "./helpers";

test("an editor publishes a reading lesson and a learner uses it", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("console", (m) => {
    if (m.type() === "error") console.log("browser error:", m.text());
  });
  page.on("pageerror", (e) => console.log("page error:", e.message));
  const slug = `e2e-${Date.now().toString(36)}`;
  const title = `Late Again ${slug.slice(4)}`;

  await signIn(page, EDITOR);

  // A new reading lesson.
  await page.getByRole("link", { name: "Create reading" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Level").selectOption("A2");
  await saveAndEdit(page, title);

  // Text, with "commute" linked to its meaning.
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute is long.");
  await linkWord(page, "commute");
  await page.getByRole("checkbox", { name: "Travel" }).check();
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // Review waits until every part is finished.
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await expect(page.getByText("Finish before it can go out:")).toBeVisible();

  // A voice-over (the free test voice), then one exercise.
  await makeTestVoiceover(page);
  await addQuestion(page, "Her commute is short.", "FALSE");

  // Still private while it's a draft.
  expect((await page.request.get(`${WEBSITE}/reading/${slug}`)).status()).toBe(404);

  // Review and publish.
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Sent for review.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  // The page refreshes into its published state (the draft is gone; revision 1 is live).
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  // A learner reads it, taps the word, adds it to their list, studies it, and answers.
  await page.goto(`${WEBSITE}/reading/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("My list for this reading: 0")).toBeVisible();
  await page.getByRole("button", { name: "commute", exact: true }).click();
  const card = page.getByRole("dialog", { name: "About “commute”" });
  await expect(card.getByText("Her commute is long.")).toBeVisible(); // the sentence from this text
  await card.getByRole("button", { name: "＋ Add to my list" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("My list for this reading: 1")).toBeVisible();
  await page.getByRole("button", { name: "Study my words" }).click();
  await expect(page.getByRole("button", { name: "commute (in your list)" })).toBeVisible();
  await page.getByRole("radio", { name: "False" }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByText("You scored 1 out of 1.")).toBeVisible();

  // The word is waiting in "My words", with the sentence it came from.
  await page
    .getByRole("link", { name: /^My words/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "My words" })).toBeVisible();
  await expect(page.getByText("“Her commute is long.”")).toBeVisible();
});
