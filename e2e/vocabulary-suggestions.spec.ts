import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, signIn } from "./helpers";

// "Suggest vocabulary" brings suggestions for the saved script; approving one links it in the script as a bold key word (a new
// item goes into the word bank as a draft); removing one takes it off the list. This stack runs without the local
// language model (LLM_BASE_URL is empty), so suggestions come from spaCy and word frequency only.
test("an editor approves and removes suggested vocabulary from the saved script", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `suggest-${Date.now().toString(36)}`;
  const title = `Suggested ${slug.slice(8)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Level").selectOption("A2");
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Zoë gave up her job because the bureaucracy was exhausting.");
  // "Save script" at the end of the Script section saves the lesson and opens it for editing.
  await expect(page.locator("#vocabulary").getByRole("button", { name: "Suggest vocabulary" })).toBeDisabled();
  await page.locator("#script").getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.locator("#script").getByRole("button", { name: "Script saved" })).toBeVisible();

  const suggestions = page.getByRole("region", { name: "Suggested for this script" });
  // Saving doesn't start it: the section's button does.
  await expect(suggestions.getByText(/Click “Suggest vocabulary”/)).toBeVisible();
  await suggestions.getByRole("button", { name: "Suggest vocabulary" }).click();
  await expect(suggestions.getByText(/^\d+ to check ·/)).toBeVisible({ timeout: 90_000 });
  await expect(suggestions.getByText(/local AI wasn't running/)).toBeVisible();
  await expect(suggestions.getByText("give up", { exact: true })).toBeVisible();
  await expect(suggestions.getByText("New: added as a draft").first()).toBeVisible();

  // Remove one: it leaves the list.
  await suggestions.getByRole("button", { name: "Remove “bureaucracy”" }).click();
  await expect(suggestions.getByRole("button", { name: "Remove “bureaucracy”" })).toBeHidden();

  // Approve one: the editor reloads with "gave up" linked as a key word, in bold.
  await suggestions.getByRole("button", { name: "Approve “give up”" }).click();
  const linked = page.getByLabel("Lesson text").locator('.lexical-link[data-key="true"]');
  await expect(linked).toHaveText("gave up");
  expect(Number(await linked.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
  await expect(page.locator("#vocabulary").getByText("★ Key word")).toBeVisible();
  await expect(suggestions.getByRole("button", { name: "Approve “give up”" })).toBeHidden();
});
