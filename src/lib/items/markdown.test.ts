import { describe, expect, it } from "vitest";

import { markdownExcerpt, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders CommonMark", () => {
    expect(renderMarkdown("# Grace\n\nBy *grace* you have been **saved**.")).toBe(
      "<h1>Grace</h1>\n<p>By <em>grace</em> you have been <strong>saved</strong>.</p>",
    );
    expect(renderMarkdown("- one\n- two")).toContain("<li>one</li>");
    expect(renderMarkdown("[the reader](/read/john-3) and <https://example.org>")).toBe(
      '<p><a href="/read/john-3">the reader</a> and <a href="https://example.org">https://example.org</a></p>',
    );
  });

  it("prints HTML written in the Markdown as text, never as markup", () => {
    const html = renderMarkdown(
      [
        "<script>alert(1)</script>",
        "",
        'Hello <img src=x onerror="alert(1)"> <b onclick="x()">there</b>',
        "",
        '<iframe src="https://evil.example"></iframe>',
        "",
        '<a href="javascript:alert(1)">click</a>',
      ].join("\n"),
    );
    expect(html).not.toMatch(/<(script|img|b|iframe|a)\b/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("takes the address off a link or an image that could run something", () => {
    const html = renderMarkdown(
      [
        "[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html,<script>x</script>)",
        "[d](vbscript:x) ![e](javascript:alert(1)) <javascript:alert(1)>",
        "",
        "[f]: javascript:alert(1)",
        "",
        "[f]",
      ].join("\n"),
    );
    expect(html).not.toMatch(/javascript:[^<]*"/i);
    expect(html).not.toMatch(/(href|src)="(?!")/);
    expect(html.match(/href=""/g)).toHaveLength(6);
    expect(html).toContain('<img src="" alt="e" />');
  });

  it("cannot be broken out of an attribute", () => {
    const html = renderMarkdown('[x](https://example.org/"onmouseover="alert(1)) ![a"b](/i.png "t\\"x")');
    expect(html).not.toMatch(/"\s*onmouseover=/);
    expect(html).toContain('alt="a&quot;b"');
    expect(html).toContain('title="t&quot;x"');
  });
});

describe("markdownExcerpt", () => {
  it("is the words alone, on one line", () => {
    expect(markdownExcerpt("# Grace\n\nBy *grace* you have\nbeen [saved](/x) & kept.")).toBe(
      "Grace By grace you have been saved & kept.",
    );
    expect(markdownExcerpt("")).toBe("");
  });

  it("keeps a word whole across inline markup, and parts blocks", () => {
    expect(markdownExcerpt("weak through the **flesh**. Then\n\n- one\n- two")).toBe(
      "weak through the flesh. Then one two",
    );
  });

  it("is cut at a word", () => {
    expect(markdownExcerpt("one two three four", 10)).toBe("one two…");
    expect(markdownExcerpt("groaning, adoption, hope", 18)).toBe("groaning…");
  });
});
