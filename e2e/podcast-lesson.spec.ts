import { expect, test } from "@playwright/test";
import { DASHBOARD, EDITOR, signIn, WEBSITE } from "./helpers";

// A podcast-style lesson: HOST1/HOST2 lines, host names set in the voice-over panel, and learners seeing those
// names. "Make it now" is turned off, so no voice-over is made and no ElevenLabs characters are spent.
test("an editor writes a two-host conversation and learners see the hosts' names", async ({ page }) => {
  const slug = `podcast-${Date.now().toString(36)}`;
  const title = `Morning Chat ${slug.slice(8)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("HOST1: Hi Max, how was your commute?");
  await page.keyboard.press("Enter");
  await page.keyboard.type("HOST2: Long, as usual.");

  await page.getByRole("button", { name: "Podcast · 2 hosts" }).click();
  await expect(page.getByText("1 HOST1 line(s), 1 HOST2 line(s)")).toBeVisible();
  await page.getByLabel("Name learners see").first().fill("Kate");
  await page.getByLabel("Name learners see").last().fill("Max");
  await page.getByLabel("Make it now").uncheck();
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("No voice-overs yet.")).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  const turn = page.locator("p.turn-host-1");
  await expect(turn).toContainText("Kate");
  await expect(turn).toContainText("Hi Max, how was your commute?");
  await expect(page.locator("p.turn-host-2")).toContainText("Max");
  await expect(page.getByText("HOST1:")).toBeHidden();
});
