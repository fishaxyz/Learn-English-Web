import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { docxText, ListFileError, readListFile } from "../lib/list-file";

/** A minimal zip archive (what a .docx is), its files stored or deflated. */
function zip(files: Record<string, string>, deflate = true): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, dir, end]));
}

const DOCUMENT = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>rely on</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">a grain </w:t></w:r><w:r><w:t>of truth</w:t></w:r><w:r><w:tab/><w:t>idiom &amp; Task 2</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>pass on</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

describe("reading a lexical list file", () => {
  it("reads a Word document's paragraphs, one per line, deflated or stored", async () => {
    for (const deflate of [true, false]) {
      const text = await docxText(zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": DOCUMENT }, deflate));
      expect(text.split("\n").filter(Boolean)).toEqual(["rely on", "a grain of truth\tidiom & Task 2", "pass on"]);
    }
  });

  it("reads plain text as it is, and refuses other files, other zips and big files", async () => {
    const file = (name: string, bytes: Uint8Array | string, size?: number) => ({
      name,
      size: size ?? (typeof bytes === "string" ? bytes.length : bytes.length),
      arrayBuffer: async () => new Uint8Array(typeof bytes === "string" ? Buffer.from(bytes) : bytes).buffer,
    });
    expect(await readListFile(file("list.TXT", "rely on\npass on"))).toBe("rely on\npass on");
    await expect(readListFile(file("list.pdf", "%PDF"))).rejects.toThrow(ListFileError);
    await expect(readListFile(file("list.docx", zip({ "other.xml": "<x/>" })))).rejects.toThrow("isn't a Word");
    await expect(readListFile(file("list.docx", "not a zip"))).rejects.toThrow("isn't a Word");
    await expect(readListFile(file("list.txt", "x", 6 * 1024 * 1024))).rejects.toThrow("too big");
  });
});
