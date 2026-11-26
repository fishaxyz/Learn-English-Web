import { expect, test } from "@playwright/test";
import { addQuestion, DASHBOARD, EDITOR, linkWord, makeTestVoiceover, saveAndEdit, signIn, WEBSITE } from "./helpers";

// Bilingual reading: an admin translates the script (the test worker's fake translator marks each sentence
// "[VI] …" instead of calling the local AI), edits and approves, and learners see approved translations only.
// Saving a changed script translates the changed sentence again, as a draft.
test("an admin translates a lesson, approves with edits, and learners read it bilingually", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `bilingual-${Date.now().toString(36)}`;
  const title = `Bilingual ${slug.slice(10)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute is long. She reads on the train.");
  await linkWord(page, "commute");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // Translation is its own section, optional for publishing.
  const section = page.locator("#translation");
  await expect(section.getByText("Optional · Vietnamese, French, German")).toBeVisible();
  await section.getByRole("button", { name: "Translate", exact: true }).click();
  const first = section.getByRole("textbox", { name: "Vietnamese translation of “Her commute is long.”" });
  await expect(first).toHaveValue("[VI] Her commute is long.", { timeout: 60_000 });
  await expect(section.getByText("0 approved · 2 to check · 0 not translated")).toBeVisible();

  // The admin rewrites one, approves it, and approves the other as it is.
  await first.fill("Quãng đường đi làm của cô ấy dài.");
  await expect(section.getByText("Edited")).toBeVisible();
  await section.getByRole("button", { name: "Approve the Vietnamese translation of “Her commute is long.”" }).click();
  await expect(section.getByText("Approved 1 translation.")).toBeVisible();
  await section.getByRole("button", { name: "✓ Approve all drafts (1)" }).click();
  await expect(section.getByText("2 approved · 0 to check · 0 not translated")).toBeVisible();

  // A changed sentence is translated again on save, as a draft; the unchanged one keeps its approved text.
  await page.getByLabel("Lesson text").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" It takes an hour.");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();
  await expect(section.getByRole("textbox", { name: "Vietnamese translation of “It takes an hour.”" })).toHaveValue(
    "[VI] It takes an hour.",
    { timeout: 60_000 }
  );
  await expect(first).toHaveValue("Quãng đường đi làm của cô ấy dài.");

  // Publish: only the two approved translations reach learners.
  await makeTestVoiceover(page);
  await addQuestion(page, "She reads on the bus.", "FALSE");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  await page.getByRole("switch", { name: "Translation" }).click();
  await expect(page.getByText("Quãng đường đi làm của cô ấy dài.")).toBeVisible();
  await expect(page.getByText("[VI] She reads on the train.")).toBeVisible();
  await expect(page.getByText("[VI] It takes an hour.")).toBeHidden(); // still a draft
  // No French yet: the page says so.
  await page.getByRole("combobox", { name: "Translation language" }).first().selectOption("fr");
  await expect(page.getByText("There’s no French translation for this lesson yet.")).toBeVisible();
});
