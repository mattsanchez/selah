import { describe, expect, it } from "vitest";

import { osisToHtml } from "./osis";

describe("osisToHtml", () => {
  it("reads paragraph milestones, titles and highlighting", () => {
    expect(
      osisToHtml(
        '<div eID="gen1" type="x-p"/> <title type="x-s3">Christ\'s Interview.</title> ' +
          '<div sID="gen2" type="x-p"/> <hi type="super">1</hi> There <hi type="italic">was</hi> a ' +
          '<hi type="small-caps">Lord</hi> <hi type="bold">Verse 2</hi><hi type="underline">u</hi>' +
          '<div eID="gen2" type="x-p"/> <div sID="gen3" type="x-p"/>Next &amp; last.',
      ),
    ).toBe(
      "<h4>Christ's Interview.</h4><p><sup>1</sup> There <i>was</i> a " +
        '<span class="sc">Lord</span> <b>Verse 2</b>u</p><p>Next &amp; last.</p>',
    );
  });

  it("links a reference to one passage and leaves the others as text", () => {
    expect(
      osisToHtml(
        '<reference osisRef="John.3.12">Joh 3:12</reference>; ' +
          '<reference osisRef="Ps.23.1-Ps.23.6">Psa 23:1-6</reference>; ' +
          '<reference osisRef="John.8.28 John.12.32">two</reference>; ' +
          '<reference osisRef="Sir.1.1">Sirach</reference>',
      ),
    ).toBe(
      '<p><a data-verses="43003012-43003012">Joh 3:12</a>; ' +
        '<a data-verses="19023001-19023006">Psa 23:1-6</a>; two; Sirach</p>',
    );
  });

  it("drops the module's own structure and breaks lines of verse", () => {
    expect(
      osisToHtml(
        '<chapter n="3" osisID="John.3" sID="John.3"/><milestone n="John" type="x-usfm-toc1"/>' +
          '<div type="x-milestone" subType="x-preverse" sID="pv1"/><div sID="g" type="introduction"/>' +
          "<lg><l>one</l><l>two</l></lg>after<note>a note</note>",
      ),
    ).toBe("<p>one<br>two<br></p><p>aftera note</p>");
  });

  it("lets no markup of the source's through", () => {
    // OSIS has no <script>; one would come out as its words, inert.
    expect(
      osisToHtml('<div type="x-p"/><script>alert(1)</script><hi type="italic" onclick="x">a</hi>'),
    ).toBe("<p>alert(1)<i>a</i></p>");
  });
});
