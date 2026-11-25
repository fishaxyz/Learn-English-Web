import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, signIn, saveAndEdit } from "./helpers";

// Creating a lesson with its text and the voice-over settings on the same page. No voice-over is made here: a
// voice is ticked to check the cost, then unticked, so this never spends ElevenLabs characters.
test("an editor creates a lesson with its text and sees what a voice-over would cost", async ({ page }) => {
  const slug = `script-${Date.now().toString(36)}`;
  const title = `Commuting ${slug.slice(7)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute is long.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("She reads on the train.");
  await expect(page.getByText("45 characters.")).toBeVisible();

  // Single voice is the default mode, read by Multilingual v2.
  await expect(page.getByRole("button", { name: "Single voice" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Multilingual v2")).toBeVisible();
  await page.getByRole("button", { name: "UK", exact: true }).click();
  const first = page.locator('input[type="checkbox"][id^="voice-"]').first();
  await first.check();
  await expect(page.getByText(/1 chosen · about 45 characters/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and Preview" })).toBeEnabled();
  await first.uncheck();

  await saveAndEdit(page, title);
  await expect(page.getByLabel("Lesson text").locator("p")).toHaveText([
    "Her commute is long.",
    "She reads on the train.",
  ]);
  await expect(page.getByText("No voice-overs yet.")).toBeVisible();
});
