import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { addQuestion, DASHBOARD, EDITOR, makeTestVoiceover, saveAndEdit, signIn, WEBSITE } from "./helpers";

/** A minimal Word document (.docx is a zip with word/document.xml), one paragraph per line. */
function docx(lines: string[]): Buffer {
  const body = lines
    .map(
      (l) =>
        `<w:p><w:r>${l
          .split("\t")
          .map((t) => `<w:t xml:space="preserve">${t}</w:t>`)
          .join("<w:tab/>")}</w:r></w:p>`
    )
    .join("");
  const raw = Buffer.from(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`);
  const data = deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(raw.length, 24);
  entry.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, entry, name, end]);
}

// The lesson's own lexical vocabulary (ADR 0010): the editor reads a list from a Word file, the test worker's fake
// explainer drafts each item ("Meaning of “…”." instead of calling the local AI), the editor edits and approves,
// and learners study the items in the Lexical Vocabulary tab. The article itself has no marked words.
test("an editor explains a lexical list from a Word file and learners study it", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `lexis-${Date.now().toString(36)}`;
  const title = `Lexis ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Farmers had little to rely on. Some sayings contained a grain of truth.");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // The list comes from a .docx (read in the browser), then is added.
  const section = page.locator("#vocabulary");
  await section.getByLabel("Choose a file (.txt or .docx)").setInputFiles({
    name: "lexis.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx(["rely on", "a grain of truth\tidiom", "rely on"]),
  });
  await expect(section.getByText("Read “lexis.docx”: check the list, then add it.")).toBeVisible();
  await expect(section.getByLabel(/^Your list/)).toHaveValue("rely on\na grain of truth\tidiom\nrely on");
  await section.getByRole("button", { name: "Add to the list" }).click();
  await expect(section.getByText("Added 2 items (1 item already in the list).")).toBeVisible();

  // The fake explainer drafts both; the editor rewrites one, makes it an idiom, and approves everything.
  const meaning = section.getByRole("textbox", { name: "Meaning of “a grain of truth”" });
  await expect(meaning).toHaveValue("Meaning of “a grain of truth”.", { timeout: 60_000 });
  await expect(section.getByText("0 approved · 2 to check · 0 waiting")).toBeVisible();
  // The sentence it's in (the quote marks are drawn by the browser).
  await expect(section.getByText("Some sayings contained a grain of truth.", { exact: true })).toBeVisible();
  await meaning.fill("a small amount of truth");
  await section.getByRole("combobox", { name: "Kind of “a grain of truth”" }).selectOption("IDIOM");
  await expect(section.getByText("Edited")).toBeVisible();
  await section.getByRole("button", { name: "✓ Approve all drafts (2)" }).click();
  await expect(section.getByText("2 approved · 0 to check · 0 waiting")).toBeVisible();
  await expect(page.getByText("2 items approved").first()).toBeVisible(); // the section header

  // Publish (a voice-over and a question are needed too).
  await makeTestVoiceover(page);
  await addQuestion(page, "Farmers had a lot to rely on.", "FALSE");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  // Learners: a clean article, and the items in their own tab, by kind.
  await page.goto(`${WEBSITE}/reading/${slug}`);
  await expect(page.getByRole("button", { name: "rely on", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Lexical Vocabulary/ }).click();
  const tab = page.getByRole("tabpanel", { name: /Lexical Vocabulary/ });
  await expect(tab.getByRole("heading", { name: "a grain of truth" })).toBeVisible();
  await expect(tab.getByText("a small amount of truth")).toBeVisible();
  await expect(tab.getByText("Meaning of “rely on”.")).toBeVisible();
  await expect(tab.getByText("A tip for IELTS.").first()).toBeVisible();
  await tab.getByRole("button", { name: "Idioms (1)" }).click();
  await expect(tab.getByRole("heading", { name: "rely on" })).toBeHidden();
  await expect(tab.getByRole("heading", { name: "a grain of truth" })).toBeVisible();
});
