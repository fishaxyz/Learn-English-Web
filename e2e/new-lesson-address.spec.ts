import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, signIn } from "./helpers";

// A title whose web address is already taken (the seed's "A Morning Commute"): the address made from the title
// becomes a free one by itself; one typed by hand is flagged, with a free one to use in a click. Then Save script
// saves the lesson and opens it, where Suggest vocabulary can be clicked.
test("a taken web address is caught before saving, and Save script opens the lesson", async ({ page }) => {
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill("A Morning Commute");
  const address = page.getByLabel("Web address");
  await expect(address).toHaveValue(/^a-morning-commute-\d+$/);

  // Typed by hand: flagged, and the buttons wait.
  await address.fill("a-morning-commute");
  const flag = page.getByRole("alert").filter({ hasText: "already used by another lesson" });
  await expect(flag).toBeVisible();
  await expect(page.locator("#script").getByRole("button", { name: "Save script" })).toBeDisabled();
  await flag.getByRole("button", { name: /^Use a-morning-commute-\d+$/ }).click();
  await expect(address).toHaveValue(/^a-morning-commute-\d+$/);
  await expect(flag).toBeHidden();

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Her commute is long, so she reads on the train.");
  await page.locator("#script").getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "A Morning Commute" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Suggested for this script" }).getByRole("button", { name: "Suggest vocabulary" })
  ).toBeEnabled();
});
