import { describe, expect, it } from "vitest";

import { parseVerses, renderStudyHtml, sanitizeStudyHtml, studyText } from "./html";

const href = (range: { start: number; end: number }) => `/read/${range.start}-${range.end}`;

describe("sanitizeStudyHtml", () => {
  it("keeps the tags it knows and drops every attribute of the source's", () => {
    expect(
      sanitizeStudyHtml(
        '<p class="x" onclick="alert(1)" style="color:red">A <i id="i">b</i> <b>c</b> ' +
          '<sup>1</sup><sub>2</sub> <span class="sc">Lord</span><br/>d</p><h4 title="t">Title</h4>',
      ),
    ).toBe(
      '<p>A <i>b</i> <b>c</b> <sup>1</sup><sub>2</sub> <span class="sc">Lord</span><br>d</p><h4>Title</h4>',
    );
  });

  it("drops scripts, styles and comments with their content", () => {
    expect(
      sanitizeStudyHtml(
        "<p>a<script>alert('x')</script><style>p{}</style><!-- <b>no</b> -->b</p>",
      ),
    ).toBe("<p>ab</p>");
  });

  it("drops tags it does not know and keeps their text", () => {
    expect(
      sanitizeStudyHtml(
        '<div><img src=x onerror=alert(1)><iframe src="https://example.org"></iframe>' +
          '<a href="javascript:alert(1)">link</a> <font color="red">text</font></div>',
      ),
    ).toBe("<p>link text</p>");
  });

  it("escapes text, including markup hidden in entities", () => {
    expect(sanitizeStudyHtml("<p>1 &lt; 2 &amp; &#60;script&#62; &quot;q&quot; <</p>")).toBe(
      "<p>1 &lt; 2 &amp; &lt;script&gt; &quot;q&quot; &lt;</p>",
    );
  });

  it("keeps a span only for the classes it knows", () => {
    expect(
      sanitizeStudyHtml(
        '<p><span class="excerpt">a<span class="evil">b</span>c</span><span class="ref">d</span></p>',
      ),
    ).toBe('<p><span class="excerpt">abc</span><span class="ref">d</span></p>');
  });

  it("keeps a link only when it names verses of the canon", () => {
    expect(
      sanitizeStudyHtml(
        '<p><a data-verses="43003016-43003018" href="https://evil.example">ok</a> ' +
          '<a data-verses="43003018-43003016">backwards</a> <a data-verses="99001001-99001001">none</a> ' +
          '<a data-verses="43003016-43003016&quot; onmouseover=&quot;x">quote</a></p>',
      ),
    ).toBe('<p><a data-verses="43003016-43003018">ok</a> backwards none quote</p>');
  });

  it("balances what it is given", () => {
    expect(sanitizeStudyHtml("loose <i>text<p>next</i> one</p></p></b><p></p><p> </p>")).toBe(
      "<p>loose <i>text</i></p><p>next one</p>",
    );
    expect(sanitizeStudyHtml("<p>a<p>b")).toBe("<p>a</p><p>b</p>");
  });

  it("changes nothing in its own output", () => {
    const once = sanitizeStudyHtml(
      '<h4>T</h4><p>A <a data-verses="43003016-43003016">John 3:16</a> &amp; <span class="sc">b</span><br>c</p>',
    );
    expect(sanitizeStudyHtml(once)).toBe(once);
  });
});

describe("renderStudyHtml", () => {
  it("gives passage links their address", () => {
    expect(
      renderStudyHtml('<p>See <a data-verses="43003016-43003018">John 3:16-18</a>.</p>', { href }),
    ).toEqual({
      html: '<p>See <a href="/read/43003016-43003018">John 3:16-18</a>.</p>',
      truncated: false,
    });
  });

  it("sanitizes again, whatever was stored", () => {
    const { html } = renderStudyHtml('<p onclick="x">a<script>b</script></p><a href="/x">c</a>', {
      href,
    });
    expect(html).toBe("<p>a</p><p>c</p>");
  });

  it("stops at the end of the block that reaches the limit", () => {
    const stored = "<p>one two three</p><p>four five six</p><p>seven</p>";
    expect(renderStudyHtml(stored, { href, limit: 20 })).toEqual({
      html: "<p>one two three</p><p>four five six</p>",
      truncated: true,
    });
    expect(renderStudyHtml(stored, { href, limit: 10 })).toEqual({
      html: "<p>one two three</p>",
      truncated: true,
    });
    expect(renderStudyHtml(stored, { href, limit: 500 }).truncated).toBe(false);
    // The last block reaching the limit leaves nothing out.
    expect(renderStudyHtml("<p>one two three</p> ", { href, limit: 10 }).truncated).toBe(false);
  });

  it("cuts a block twice the limit long at a word, with its tags closed", () => {
    expect(
      renderStudyHtml("<p>one <i>two three four five six</i> seven</p>", { href, limit: 8 }),
    ).toEqual({ html: "<p>one <i>two three…</i></p>", truncated: true });
  });
});

describe("studyText", () => {
  it("is the words, a block to a line", () => {
    expect(
      studyText('<h4>Title</h4><p>A &amp; <i>b</i><br>c <a data-verses="1-2">d</a></p><p>e</p>'),
    ).toBe("Title\nA & b\nc d\ne");
  });
});

describe("parseVerses", () => {
  it("reads two verse ids in order", () => {
    expect(parseVerses("43003016-43003018")).toEqual({ start: 43003016, end: 43003018 });
    expect(parseVerses("1001001-1001001")).toEqual({ start: 1001001, end: 1001001 });
    expect(parseVerses("43003016")).toBeUndefined();
    expect(parseVerses("43003099-43003099")).toBeUndefined();
    expect(parseVerses(undefined)).toBeUndefined();
  });
});
