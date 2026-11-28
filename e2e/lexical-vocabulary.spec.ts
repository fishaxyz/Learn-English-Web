import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { addQuestion, DASHBOARD, EDITOR, makeTestVoiceover, saveAndEdit, signIn, WEBSITE } from "./helpers";

/** A minimal zip archive (what a .docx is), its files deflated. */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [file, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw);
    const name = Buffer.from(file);
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
    entry.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(entry, name);
    offset += 30 + name.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** A Word document whose items are numbered by Word itself (the numbers aren't in the text). */
function docx(lines: { text: string; numbered?: boolean }[]): Buffer {
  const numbering = `<w:numbering><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/>
<w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const body = lines
    .map(
      (l) =>
        `<w:p>${l.numbered ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : ""}` +
        `<w:r><w:t xml:space="preserve">${l.text}</w:t></w:r></w:p>`
    )
    .join("");
  return zip({
    "word/document.xml": `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`,
    "word/numbering.xml": numbering,
  });
}

// The lesson's own lexical vocabulary (ADR 0011): the editor's vocabulary sheet (a Word file in Vietnamese, then a
// pasted one in French) is read as written; the editor checks and approves; learners study the items in the
// Lexical Vocabulary tab with the meanings and translations for their own language. No AI is involved.
test("an editor adds vocabulary sheets in two languages and learners study them in theirs", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = `lexis-${Date.now().toString(36)}`;
  const title = `Lexis ${slug.slice(6)}`;
  await signIn(page, EDITOR);
  await page.goto(`${DASHBOARD}/lessons/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await saveAndEdit(page, title);

  await page.getByLabel("Lesson text").click();
  await page.keyboard.type("Farmers had little to rely on. Some sayings contained only the tip of the iceberg.");
  await page.getByRole("button", { name: "Save script" }).click();
  await expect(page.getByRole("button", { name: "Script saved" })).toBeVisible();

  // A Vietnamese sheet from a .docx (read in the browser).
  const section = page.locator("#vocabulary");
  await section.getByLabel("Choose a file (.txt or .docx)").setInputFiles({
    name: "lexis.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx([
      { text: "B. Phrases &amp; collocations" },
      { text: "rely on (phr v) – dựa vào", numbered: true },
      { text: "to need something in order to work properly" },
      { text: "Example: Farmers had little to rely on." },
      { text: "→ Nông dân có rất ít thứ để dựa vào." },
      { text: "Synonyms:" },
      { text: "depend on – neutral (phụ thuộc vào)" },
      { text: "C. Idioms" },
      { text: "the tip of the iceberg (idiom) – phần nổi của tảng băng", numbered: true },
      { text: "a small part of a bigger problem" },
      { text: "Note: ⚠️ Hợp với Speaking" },
    ]),
  });
  await expect(section.getByText("Read “lexis.docx”: check the language, then add the sheet.")).toBeVisible();
  await expect(section.getByLabel(/^Vocabulary sheet/)).toHaveValue(/^B\. Phrases & collocations\n1\. rely on/);
  await expect(section.getByLabel("Meanings and translations in")).toHaveValue("vi");
  await section.getByRole("button", { name: "Add the sheet" }).click();
  await expect(section.getByText("Added 2 items.")).toBeVisible();
  await expect(section.getByText("0 approved · 2 to check")).toBeVisible();

  // The editor checks an item as learners will see it.
  await section.getByText("rely on", { exact: true }).click();
  await expect(section.getByText("Nông dân có rất ít thứ để dựa vào.", { exact: false })).toBeVisible();
  await expect(section.getByText("In the text", { exact: true })).toBeVisible();
  await expect(section.getByRole("combobox", { name: "Kind of “rely on”" })).toHaveValue("PHRASAL_VERB");

  // A French sheet, pasted: it adds French to the same item.
  await section
    .getByLabel(/^Vocabulary sheet/)
    .fill(
      "1. rely on (phr v) – compter sur\nExample: Farmers had little to rely on.\n→ Les paysans avaient peu de choses sur quoi compter."
    );
  await section.getByLabel("Meanings and translations in").selectOption("fr");
  await section.getByRole("button", { name: "Add the sheet" }).click();
  await expect(section.getByText("Added 0 items, updated 1 item (check them again).")).toBeVisible();
  await section.getByRole("button", { name: "✓ Approve all drafts (2)" }).click();
  await expect(section.getByText("2 approved · 0 to check")).toBeVisible();
  await expect(page.getByText("2 items approved").first()).toBeVisible(); // the section header

  // Publish (a voice-over and a question are needed too).
  await makeTestVoiceover(page);
  await addQuestion(page, "Farmers had a lot to rely on.", "FALSE");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText(/Published as revision 1\./)).toBeVisible();

  // Learners: the items in their own tab, in Vietnamese first…
  await page.goto(`${WEBSITE}/reading/${slug}`);
  await page.getByRole("tab", { name: /^Lexical Vocabulary/ }).click();
  const tab = page.getByRole("tabpanel", { name: /Lexical Vocabulary/ });
  const rely = tab.getByRole("article", { name: "rely on" });
  // Cards start closed: the words and the meaning; a tap opens one, "Open all" opens them all.
  await expect(rely.getByText("dựa vào", { exact: true })).toBeVisible();
  await expect(rely.getByText("Nông dân có rất ít thứ để dựa vào.")).toBeHidden();
  await rely.getByRole("button", { expanded: false }).click();
  await expect(rely.getByText("Nông dân có rất ít thứ để dựa vào.")).toBeVisible();
  await rely.getByRole("button", { expanded: true }).click();
  await expect(rely.getByText("Nông dân có rất ít thứ để dựa vào.")).toBeHidden();
  await tab.getByRole("button", { name: "Open all" }).click();
  await expect(tab.getByRole("button", { name: "Close all" })).toBeVisible();
  await expect(rely.getByText("Nông dân có rất ít thứ để dựa vào.")).toBeVisible();
  await expect(rely.getByText("(phụ thuộc vào)")).toBeVisible();
  await expect(
    tab.getByRole("article", { name: "the tip of the iceberg" }).getByText("⚠️ Hợp với Speaking")
  ).toBeVisible();
  await tab.getByRole("button", { name: "Idioms (1)" }).click();
  await expect(rely).toBeHidden();
  await tab.getByRole("button", { name: /^All/ }).click();

  // …then in French: the French sheet's parts; the Vietnamese-only note is gone.
  await page.getByRole("tab", { name: /^Article/ }).click();
  await page.getByRole("combobox", { name: "Translation language" }).first().selectOption("fr");
  await page.getByRole("tab", { name: /^Lexical Vocabulary/ }).click();
  await expect(rely.getByText("compter sur", { exact: true })).toBeVisible();
  await expect(rely.getByText("Les paysans avaient peu de choses sur quoi compter.")).toBeVisible();
  await expect(tab.getByText("⚠️ Hợp với Speaking")).toBeHidden();
});
