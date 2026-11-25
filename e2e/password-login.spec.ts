import { expect, test } from "@playwright/test";
import { DASHBOARD, inviteFreshEditor, signIn } from "./helpers";

// An invited editor signs in once by email link, sets a password on their Account page, then signs in with it.
test("an editor sets a password and signs in with it", async ({ page }) => {
  test.setTimeout(120_000);
  const email = inviteFreshEditor();
  const password = "Tea at seven, rain later";

  await signIn(page, email);
  await page.getByRole("button", { name: email }).click(); // the account menu, top right
  await page.getByRole("banner").getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

  // A weak password is refused, with the reason (too-short ones are already stopped by the browser).
  await page.getByLabel("New password", { exact: true }).fill("aaaaaaaaaaaa");
  await page.getByLabel("New password again").fill("aaaaaaaaaaaa");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Use a less repetitive password.")).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("New password again").fill(password);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Password saved.")).toBeVisible();

  await page.getByRole("button", { name: email }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  // A wrong password says only that it doesn't match.
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password don't match.", { exact: false })).toBeVisible();

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  expect(page.url()).toBe(`${DASHBOARD}/`);
});
