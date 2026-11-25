import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, signIn } from "./helpers";

// Creating a lesson with its script pasted in, and the voice picker on the same form. No voice-over is made here:
// a voice is ticked to check the cost, then unticked, so this never spends ElevenLabs characters.
test("an editor creates a lesson from a pasted script and sees what voice-overs would cost", async ({ page }) => {
  const slug = `script-${Date.now().toString(36)}`;
  const title = `Commuting ${slug.slice(7)}`;
  const script = "Her commute is long.\n\nShe reads on the train.";
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await expect(page.getByText("Paste a script to choose voices.")).toBeVisible();
  await page.getByLabel(/^Script/).fill(script);
  await expect(page.getByText("45 characters.")).toBeVisible();

  const voices = page.getByRole("group", { name: "Filter voices" });
  await expect(voices).toBeVisible();
  await page.getByRole("button", { name: "UK", exact: true }).click();
  const first = page.locator('input[type="checkbox"][id^="voice-"]').first();
  await first.check();
  await expect(page.getByText(/1 chosen · about 45 characters/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create draft and make voice-overs" })).toBeVisible();
  await first.uncheck();

  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const text = page.getByLabel("Lesson text");
  await expect(text.locator("p")).toHaveText(["Her commute is long.", "She reads on the train."]);
  await expect(page.getByText("No voice-overs yet.")).toBeVisible();
});
