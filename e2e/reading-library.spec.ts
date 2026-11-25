import { expect, test } from "@playwright/test";
import { EDITOR, signIn, saveAndEdit } from "./helpers";

// The Reading Library: find a reading by search, narrow by status tab, switch to cards, and open its menu.
test("an editor finds a reading in the Reading Library", async ({ page }) => {
  const slug = `library-${Date.now().toString(36)}`;
  const title = `Library Find ${slug.slice(8)}`;
  await signIn(page, EDITOR);

  await page.getByRole("link", { name: "Create reading" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Reading Library" }).click();
  await expect(page.getByRole("heading", { name: "Reading Library" })).toBeVisible();

  await page.getByLabel("Search readings", { exact: true }).last().fill(slug);
  await expect(page).toHaveURL(new RegExp(`q=${slug}`));
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByText("Showing 1 of")).toBeVisible();

  // A new reading is a draft: it's under Drafts, not Published.
  await page
    .getByRole("navigation", { name: "Status" })
    .getByRole("button", { name: /^Published/ })
    .click();
  await expect(page.getByText("No readings match these filters.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Status" })
    .getByRole("button", { name: /^Drafts/ })
    .click();
  await expect(table.getByRole("link", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page).toHaveURL(/view=grid/);
  await page.getByRole("button", { name: `Actions for “${title}”` }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
