import { describe, expect, it } from "vitest";

import { normalizeTyndaleItems, parseTyndaleItems, tyndaleToHtml } from "./tyndale";

const item = (name: string, refs: string, body: string) =>
  `<item name="${name}" typename="StudyNote" product="TyndaleOpenStudyNotes">\n<refs>${refs}</refs>\n<body>\n${body}\n</body>\n</item>`;

const XML = `<items release="1.25">
${item(
  "John.3.16",
  "John.3.16",
  '<p class="sn-text"><span class="sn-ref"><a href="?bref=John.3.16">3:16</a></span> The truth that <span class="sn-excerpt">God loved the world</span> is basic (<a href="?bref=1Jn.4.9-10">1 Jn 4:9-10</a>; see <a href="?item=TheWorld_ThemeNote_Filament">“The World” Theme Note</a>).</p>',
)}
${item("Gen.11.27-25.11", "Gen.11.27", '<p class="sn-text">A long section.</p>')}
${item("John.3.16", "John.3.16", '<p class="sn-text" ts="x">A second note.</p>')}
${item("Baptism", "Baptism", '<p class="sn-text">Not on a passage.</p>')}
<item name="Abraham" typename="Profile" product="TyndaleOpenStudyNotes">
<refs>Gen.12.1</refs>
<body><p>A profile.</p></body>
</item>
</items>`;

describe("parseTyndaleItems", () => {
  it("reads the study notes and nothing else", () => {
    const items = parseTyndaleItems(XML);
    expect(items.map((each) => [each.name, each.refs])).toEqual([
      ["John.3.16", "John.3.16"],
      ["Gen.11.27-25.11", "Gen.11.27"],
      ["John.3.16", "John.3.16"],
      ["Baptism", "Baptism"],
    ]);
    expect(items[1].body.trim()).toBe('<p class="sn-text">A long section.</p>');
  });
});

describe("tyndaleToHtml", () => {
  it("maps Tyndale's classes and links passages", () => {
    expect(
      tyndaleToHtml(
        '<p class="sn-text"><span class="sn-ref"><a href="?bref=IISam.7.1-17">7:1-17</a></span> ' +
          '<span class="sn-excerpt">the <span class="sn-excerpt-divine-name">Lord</span></span> ' +
          '(Hebrew <span class="hebrew">bara’</span>) in 586 <span class="era">BC</span> ' +
          '<span class="ital">torah</span> x<span class="sup">2</span> <span class="unknown">u</span></p>' +
          '<p class="sn-list-1">A list line.</p>',
      ),
    ).toBe(
      '<p><span class="ref"><a data-verses="10007001-10007017">7:1-17</a></span> ' +
        '<span class="excerpt">the <span class="sc">Lord</span></span> ' +
        '(Hebrew <i>bara’</i>) in 586 <span class="sc">BC</span> <i>torah</i> x<sup>2</sup> u</p>' +
        "<p>A list line.</p>",
    );
  });

  it("keeps the words of a link it cannot follow", () => {
    expect(
      tyndaleToHtml(
        '<p><a href="?item=TheWorld_ThemeNote_Filament">Theme Note</a> <a href="?bref=Gen.1.3-2">1:3–2:3</a> ' +
          '<a href="https://example.org/">out</a></p>',
      ),
    ).toBe("<p>Theme Note 1:3–2:3 out</p>");
  });
});

describe("normalizeTyndaleItems", () => {
  it("stores a note on the passage it is about and joins notes on the same passage", () => {
    const { records, skipped } = normalizeTyndaleItems(parseTyndaleItems(XML));
    expect(skipped).toEqual(["Baptism"]);
    expect(records.map((record) => [record.verseStart, record.verseEnd])).toEqual([
      [1011027, 1025011],
      [43003016, 43003016],
    ]);
    expect(records[1].html).toBe(
      '<p><span class="ref"><a data-verses="43003016-43003016">3:16</a></span> The truth that ' +
        '<span class="excerpt">God loved the world</span> is basic ' +
        '(<a data-verses="62004009-62004010">1 Jn 4:9-10</a>; see “The World” Theme Note).</p>' +
        "<p>A second note.</p>",
    );
  });
});
