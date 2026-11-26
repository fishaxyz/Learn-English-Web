import { expect, test } from "@playwright/test";
import { addQuestion, DASHBOARD, EDITOR, linkWord, makeTestVoiceover, signIn, WEBSITE, saveAndEdit } from "./helpers";

// An admin (here the owner) writes an essay and publishes it in one step, without the review queue.
test("an admin publishes an essay with Publish now", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = `essay-${Date.now().toString(36)}`;
  const title = `Morning Routines ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Many people drink coffee before their commute. Others go for a run.");
  await linkWord(page, "commute");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // Saved, but not finished: Publish now waits for the voice-over and the questions.
  await expect(page.getByRole("button", { name: "Publish now" })).toBeDisabled();
  await makeTestVoiceover(page);
  await addQuestion(page, "Everyone goes for a run.", "FALSE");

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  await page.goto(`${WEBSITE}/reading/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Many people drink coffee before their commute.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();

  // Tapping a sentence plays just that sentence, from where it starts in the voice-over.
  await expect(page.getByText("Tap any sentence to hear it.")).toBeVisible();
  /** Where a word of the lesson text is on screen. */
  const pointAt = (word: string) =>
    page
      .locator("p[data-block-id]")
      .first()
      .evaluate((p, w) => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
          const at = node.data.indexOf(w);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at + 1);
          range.setEnd(node, at + 2);
          const r = range.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        throw new Error(`"${w}" isn't in the text`);
      }, word);
  const audio = page.locator("audio");
  const time = () => audio.evaluate((a: HTMLAudioElement) => a.currentTime);
  const paused = () => audio.evaluate((a: HTMLAudioElement) => a.paused);

  // The first sentence plays, then stops before the second one starts (the test voice speaks 60 ms per character:
  // "Others" starts about 2.8 s in).
  const first = await pointAt("people");
  await page.mouse.click(first.x, first.y);
  await expect.poll(paused).toBe(false);
  await expect.poll(paused, { timeout: 10_000 }).toBe(true);
  expect(await time()).toBeGreaterThan(1.5);
  expect(await time()).toBeLessThan(3.0);

  // The second sentence plays from where it starts.
  const second = await pointAt("Others");
  await page.mouse.click(second.x, second.y);
  await expect.poll(time).toBeGreaterThan(2.5);

  // Read-along follows word by word by default; Reading settings switches it to the whole sentence.
  /** The text the read-along highlight is on right now. */
  const lit = (name: string) =>
    page.evaluate((n) => {
      const h = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get(n);
      return h ? [...h].map((r) => r.toString()).join(" ") : "";
    }, name);
  await expect.poll(() => lit("read-along")).toMatch(/^\w+[.,]?$/);
  const highlightChoice = page.getByRole("radiogroup", { name: "Highlight while listening" });
  await highlightChoice.getByRole("radio", { name: "Sentence by sentence" }).click();
  await expect(highlightChoice.getByRole("radio", { name: "Sentence by sentence" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await page.mouse.click(second.x, second.y);
  await expect.poll(() => lit("read-along-sentence")).toBe("Others go for a run.");
  expect(await lit("read-along")).toBe("");

  // Combined: the sentence and the word in it. The player's button goes through the three styles.
  await page.getByRole("button", { name: "Sentence highlight" }).click();
  await expect(page.getByRole("button", { name: "Combined highlight" })).toBeVisible();
  await page.mouse.click(second.x, second.y);
  await expect.poll(() => lit("read-along-sentence")).toBe("Others go for a run.");
  await expect.poll(() => lit("read-along")).toMatch(/^\w+[.,]?$/);

  // Bilingual layout (stand-ins until lessons have translations): the lines sit outside the lesson text, so
  // read-along still lights exactly the English sentence.
  await page.goto(`${WEBSITE}/reading/${slug}?preview-translations`);
  await page.getByRole("switch", { name: "Translation" }).click();
  const standIn = page.getByText("[Vietnamese translation of “Others go for a run.”]");
  await expect(standIn).toBeVisible();
  const again = await pointAt("Others");
  await page.mouse.click(again.x, again.y);
  await expect.poll(() => lit("read-along-sentence")).toBe("Others go for a run.");

  const display = page.getByRole("radiogroup", { name: "Display mode" });
  await display.getByRole("radio", { name: "Paragraph by paragraph" }).click();
  await expect(page.locator("p[data-extra]")).toContainText("[Vietnamese translation of “Many people");
  await display.getByRole("radio", { name: "On demand" }).click();
  await expect(standIn).toBeHidden();
  const tapAgain = await pointAt("Others");
  await page.mouse.click(tapAgain.x, tapAgain.y);
  await expect(standIn).toBeVisible();

  // The languages: Vietnamese, French and German.
  await page.getByRole("combobox", { name: "Translation language" }).first().selectOption("fr");
  await expect(page.getByText("[French translation of “Others go for a run.”]")).toBeVisible();

  // Repeat loops the whole recording by default; Reading settings can make it loop the current sentence.
  await expect(page.locator("audio")).not.toHaveAttribute("loop");
  await page.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(page.locator("audio")).toHaveAttribute("loop");
  await page.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Current sentence" }).click();
  await expect(page.locator("audio")).not.toHaveAttribute("loop");
  await expect(page.getByRole("button", { name: "Repeat sentence" })).toBeVisible();
  const last = await pointAt("Others");
  await page.mouse.click(last.x, last.y);
  // The sentence ends near the end of the recording; it starts again instead of stopping.
  let jumpedBack = false;
  for (let i = 0; i < 40 && !jumpedBack; i++) {
    const before = await time();
    await page.waitForTimeout(150);
    jumpedBack = (await time()) < before - 0.3;
  }
  expect(jumpedBack).toBe(true);
  expect(await paused()).toBe(false);
});
