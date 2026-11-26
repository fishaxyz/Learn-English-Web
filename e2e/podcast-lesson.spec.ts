import { expect, test } from "@playwright/test";
import { addQuestion, approveWhenReady, DASHBOARD, EDITOR, linkWord, signIn, WEBSITE, saveAndEdit } from "./helpers";

// A podcast-style lesson: HOST1/HOST2 lines, host names and voices set in the voice-over panel, made as one
// conversation voice-over by the worker (the free test voices: this stack runs with TTS_PROVIDER=fake), then
// finished and published. Learners see the hosts' names and can listen to the conversation.
test("an editor makes a two-host podcast lesson and learners see and hear the hosts", async ({ page }) => {
  test.setTimeout(120_000);
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
  page.once("dialog", (d) => void d.accept());
  await saveAndEdit(page, title);

  // The conversation is made in the background; then the other parts.
  await approveWhenReady(page);
  await expect(page.locator("#voice").getByText("Conversation · Kate & Max", { exact: true })).toBeVisible();
  await linkWord(page, "commute");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();
  await addQuestion(page, "Max's commute was short.", "FALSE");

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  const turn = page.locator("p.turn-host-1");
  await expect(turn).toContainText("Kate");
  await expect(turn).toContainText("Hi Max, how was your");
  await expect(page.locator("p.turn-host-2")).toContainText("Max");
  await expect(page.getByText("HOST1:")).toBeHidden();
  await expect(page.getByLabel("Voice: Conversation · Kate & Max")).toBeVisible();
});
