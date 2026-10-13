import { describe, expect, it } from "vitest";

import { readZip } from "./zip";
import { zip } from "./zip.fixture";

const text = (bytes: Uint8Array | undefined) => bytes && new TextDecoder().decode(bytes);

describe("readZip", () => {
  const archive = zip({
    "bsb_usfm/JHN.usfm": "\\id JHN\n" + "Jesus wept. ".repeat(200),
    "bsb_usfm/": "",
    "copr.htm": "<p>Public Domain</p>",
  });

  it("reads deflated and stored files by name", () => {
    const files = readZip(archive);
    expect([...files.keys()]).toEqual(["bsb_usfm/JHN.usfm", "copr.htm"]);
    expect(text(files.get("copr.htm"))).toBe("<p>Public Domain</p>");
    expect(text(files.get("bsb_usfm/JHN.usfm"))).toMatch(/^\\id JHN\n(Jesus wept\. ){200}$/);
    expect(archive.length).toBeLessThan(1000);
  });

  it("reads only the files asked for", () => {
    expect([...readZip(archive, (name) => name.endsWith(".usfm")).keys()]).toEqual([
      "bsb_usfm/JHN.usfm",
    ]);
  });

  it("rejects what is not a zip archive, and a file that fails its checksum", () => {
    expect(() => readZip(new TextEncoder().encode("<html>Not found</html>"))).toThrow(
      "Not a zip archive",
    );
    const damaged = Uint8Array.from(zip({ "a.usfm": "Jesus wept." }));
    damaged[30 + "a.usfm".length] ^= 0xff;
    expect(() => readZip(damaged)).toThrow("fails its checksum");
  });
});
