import { describe, expect, it } from "vitest";

import { AnswerParser, applyEvent, emptyAnswer, followsContract, parseAnswer, verifyQuote, type Citable, type SectionId } from "./answer";
import { QUOTE_MAX_WORDS } from "./quote";

const stored = (id: string, license: string) => ({
  id,
  name: id,
  license,
  attribution: `${id} attribution`,
  sourceUrl: `https://example.org/${id}`,
});

const citable: Citable = {
  verses: [
    { start: 43003016, end: 43003016 },
    { start: 43003017, end: 43003017 },
    { start: 45008028, end: 45008030 },
  ],
  sources: new Map([
    ["c1", { source: stored("matthew-henry", "Public domain"), label: "Matthew Henry (English Puritan tradition)", reference: "John 3:16", href: "/read/john-3.16", text: "Love is the source of all. It gave.\nNext line here." }],
    ["c2", { source: stored("tyndale", "CC BY-SA 4.0"), label: "Tyndale Open Study Notes (Protestant evangelical tradition)", reference: "John 3:16", href: "/read/john-3.16", text: "God’s love is shown in the giving of his Son." }],
  ]),
};

const answer = (body: string) => `## What the text says\n\n${body}\n\n## Interpretation\n\nReaders differ.\n`;
const segments = (written: string, id: SectionId = "text") =>
  parseAnswer(written, citable).sections.find((section) => section.id === id)!.segments;

describe("citations", () => {
  it("links a verse or range the context held", () => {
    const found = segments(answer("It says so [[43003016]] and [[45008028-45008030]]."));
    expect(found).toContainEqual({ type: "cite", range: { start: 43003016, end: 43003016 }, reference: "John 3:16", href: "/read/john-3.16" });
    expect(found).toContainEqual({ type: "cite", range: { start: 45008028, end: 45008030 }, reference: "Romans 8:28-30", href: "/read/romans-8.28-30" });
  });

  it("links across neighbouring verses of the context", () => {
    expect(segments(answer("[[43003016-43003017]]")).some((segment) => segment.type === "cite")).toBe(true);
  });

  it("never links a citation outside the context: it is dropped, and counted", () => {
    const parsed = parseAnswer(answer("It says [[66022021]] and [[43003016-43003018]] and [[99999999]] and [[c9]]."), citable);
    const all = parsed.sections.flatMap((section) => section.segments);
    expect(all.some((segment) => segment.type === "cite" || segment.type === "source")).toBe(false);
    expect(parsed.dropped.map((each) => each.written)).toEqual(["66022021", "43003016-43003018", "99999999", "c9"]);
    expect(parsed.dropped.every((each) => each.kind === "citation")).toBe(true);
  });

  it("reads a reference written out, under the same rule", () => {
    expect(segments(answer("[[John 3:16]]")).some((segment) => segment.type === "cite")).toBe(true);
    expect(parseAnswer(answer("[[John 4:1]]"), citable).dropped).toHaveLength(1);
  });

  it("keeps the reader's translation on a link", () => {
    const [, cite] = parseAnswer(answer("So [[43003016]]"), { ...citable, t: "web" }).sections[0].segments;
    expect(cite).toMatchObject({ href: "/read/john-3.16?t=web" });
  });

  it("names a cited commentary from the context, not from the model", () => {
    const found = segments(answer("See [[c2]]."));
    expect(found).toContainEqual({ type: "source", id: "c2", label: "Tyndale Open Study Notes (Protestant evangelical tradition)", reference: "John 3:16", href: "/read/john-3.16" });
  });
});

describe("quotes", () => {
  const quoted = (words: string, source = "c2") => `## What the text says\n\nIt says.\n\n## Interpretation\n\n<quote source="${source}">${words}</quote>\n`;

  it("shows words found in the source, with who said them taken from the source id", () => {
    const [quote] = segments(quoted("God's love is shown"), "interpretation");
    expect(quote).toMatchObject({
      type: "quote",
      quote: {
        sourceId: "tyndale",
        label: "Tyndale Open Study Notes (Protestant evangelical tradition)",
        text: "God's love is shown",
        license: "CC BY-SA 4.0",
        attribution: "tyndale attribution",
        shortened: false,
        shareAlike: { credit: "© 2022 Tyndale House Publishers", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
      },
    });
  });

  it("drops words that are not in the source named, or a source not in the context", () => {
    for (const written of [quoted("God's anger is shown"), quoted("Love is the source", "c2"), quoted("God's love", "c9")]) {
      const parsed = parseAnswer(written, citable);
      expect(parsed.sections[1].segments.some((segment) => segment.type === "quote")).toBe(false);
      expect(parsed.dropped[0].kind).toBe("quote");
    }
  });

  it("drops a quote with no source id at all", () => {
    expect(parseAnswer(quoted("x").replace(' source="c2"', ""), citable).dropped[0].kind).toBe("quote");
  });

  it("keeps commentators out of what the text says", () => {
    const parsed = parseAnswer(answer('<quote source="c2">God’s love is shown</quote>'), citable);
    expect(parsed.sections[0].segments.some((segment) => segment.type === "quote")).toBe(false);
    expect(parsed.dropped[0].kind).toBe("quote");
  });

  it("marks words left out, and only ever with what the source has", () => {
    expect(verifyQuote("God’s love … his Son", citable.sources.get("c2")!.text)).toEqual({ text: "God’s love […] his Son", shortened: true });
    expect(verifyQuote("his Son … God’s love", citable.sources.get("c2")!.text)).toBeUndefined();
    expect(verifyQuote("… is shown", citable.sources.get("c2")!.text)).toEqual({ text: "[…] is shown", shortened: true });
    expect(verifyQuote("", "anything")).toBeUndefined();
  });

  it("cuts a long quote and marks the cut", () => {
    const source = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");
    const verified = verifyQuote(source, source)!;
    expect(verified.shortened).toBe(true);
    expect(verified.text.endsWith("[…]")).toBe(true);
    expect(verified.text.split(" ")).toHaveLength(QUOTE_MAX_WORDS + 1);
  });
});

describe("the sections", () => {
  it("leaves out what comes before the first heading", () => {
    const written = `Sure! Here goes [[43003016]].\n\n${answer("It says.")}`;
    const parsed = parseAnswer(written, citable);
    expect(JSON.stringify(parsed)).not.toContain("Sure!");
    expect(parsed.dropped).toEqual([]);
  });

  it("holds an answer to both sections", () => {
    expect(followsContract(parseAnswer(answer("It says."), citable))).toBe(true);
    expect(followsContract(parseAnswer("## What the text says\n\nIt says.\n", citable))).toBe(false);
    expect(followsContract(parseAnswer("## Interpretation\n\nIt means.\n", citable))).toBe(false);
    expect(followsContract(parseAnswer("Just some words.", citable))).toBe(false);
  });

  it("takes a heading however it is written, and keeps an unknown one as text", () => {
    const parsed = parseAnswer("# what the text says:\n\nA.\n\n### Notes\n\nB.\n\n## INTERPRETATION\n\nC.", citable);
    expect(followsContract(parsed)).toBe(true);
    expect(JSON.stringify(parsed.sections[0].segments)).toContain("Notes");
  });

  it("treats brackets and tags that are not markers as text", () => {
    const parsed = parseAnswer(answer("Arrays [[ and a < b and <quoted> words"), citable);
    expect(JSON.stringify(parsed.sections[0].segments)).toContain("<quoted>");
  });
});

describe("streaming", () => {
  const written =
    "## What the text says\n\nIt says [[43003016]] and more [[66022021]].\n\n## Interpretation\n\nReaders differ [[c1]].\n\n" +
    'Tyndale writes:\n\n<quote source="c2">God’s love is shown</quote>\n\nThe end.\n';

  it("gives the same answer wherever the text is cut", () => {
    const whole = parseAnswer(written, citable);
    for (let size = 1; size < 40; size++) {
      const parser = new AnswerParser(citable);
      const built = emptyAnswer();
      let section: SectionId | undefined;
      for (let at = 0; at < written.length; at += size) {
        for (const event of parser.push(written.slice(at, at + size))) section = applyEvent(built, section, event);
      }
      for (const event of parser.end()) section = applyEvent(built, section, event);
      expect(built).toEqual(whole);
    }
  });

  it("passes text on before the answer is finished", () => {
    const parser = new AnswerParser(citable);
    const events = parser.push("## What the text says\n\nThe text ");
    expect(events.some((event) => event.type === "segment" && event.segment.type === "text")).toBe(true);
  });

  it("never lets half a marker out as text", () => {
    const parser = new AnswerParser(citable);
    const events = [...parser.push("## What the text says\n\nSee [[4300"), ...parser.push("3016")];
    expect(JSON.stringify(events)).not.toContain("[[");
  });
});
