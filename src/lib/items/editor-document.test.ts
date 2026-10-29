import { describe, expect, it } from "vitest";

import { documentPassages } from "./cards";
import {
  docToMarkdown,
  markdownToDoc,
  passageSource,
  type EditorNode,
} from "./editor-document";
import { renderMarkdown } from "./markdown";

const text = (value: string, ...marks: EditorNode["marks"] & object): EditorNode =>
  marks.length > 0 ? { type: "text", text: value, marks } : { type: "text", text: value };
const p = (...content: EditorNode[]): EditorNode =>
  content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
const heading = (level: number, ...content: EditorNode[]): EditorNode => ({
  type: "heading",
  attrs: { level },
  content,
});
const item = (...content: EditorNode[]): EditorNode => ({ type: "listItem", content });
const passage = (reference: string, translation: string | null = null, source: string | null = null) => ({
  type: "passage",
  attrs: { reference, translation, source },
});
const doc = (...content: EditorNode[]) => ({ type: "doc" as const, content });
const bold = { type: "bold" as const };
const italic = { type: "italic" as const };
const code = { type: "code" as const };
const link = (href: string) => ({ type: "link" as const, attrs: { href } });

// Everything the editor can make, in one document.
const EVERYTHING = doc(
  heading(2, text("Abide")),
  p(text("Apart from him, "), text("nothing", bold), text(". Not "), text("one", italic), text(" thing.")),
  passage("John 15:4-5", "BSB"),
  p(text("Read "), text("the vine", link("https://example.org/vine")), text(" again.")),
  heading(3, text("What it asks")),
  {
    type: "bulletList",
    content: [item(p(text("Remain"))), item(p(text("Bear "), text("fruit", bold, italic)))],
  },
  {
    type: "orderedList",
    attrs: { start: 3 },
    content: [item(p(text("Third"))), item(p(text("Fourth")), { type: "bulletList", content: [item(p(text("Nested")))] })],
  },
  { type: "blockquote", content: [p(text("Without me you can do nothing."))] },
  { type: "horizontalRule" },
  { type: "image", attrs: { src: "https://example.org/vine.jpg", alt: "A vine", title: null } },
  passage("Romans 8:1", "KJV"),
  passage("Psalm 46:1"),
  p(text("Line one"), { type: "hardBreak" }, text("line two, with "), text("code", code), text(".")),
  { type: "codeBlock", attrs: { language: "js" }, content: [text("const a = 1;\n\nconst b = 2;")] },
);

describe("docToMarkdown", () => {
  it("writes each block as CommonMark, and each passage as a card on a line of its own", () => {
    expect(docToMarkdown(EVERYTHING)).toBe(
      [
        "## Abide",
        "Apart from him, **nothing**. Not *one* thing.",
        "[[John 15:4-5 | BSB]]",
        "Read [the vine](https://example.org/vine) again.",
        "### What it asks",
        "- Remain\n- Bear ***fruit***",
        "3. Third\n4. Fourth\n   - Nested",
        "> Without me you can do nothing.",
        "---",
        "![A vine](https://example.org/vine.jpg)",
        "[[Romans 8:1 | KJV]]",
        "[[Psalm 46:1]]",
        "Line one\\\nline two, with `code`.",
        "```js\nconst a = 1;\n\nconst b = 2;\n```",
      ].join("\n\n"),
    );
  });

  it("indexes the same passages as the cards it writes", () => {
    const translations = [
      { id: "bsb", abbrev: "BSB" },
      { id: "kjv", abbrev: "KJV" },
    ];
    expect(documentPassages(docToMarkdown(EVERYTHING), translations)).toEqual([
      { start: 19046001, end: 19046001, translationId: null },
      { start: 43015004, end: 43015005, translationId: "bsb" },
      { start: 45008001, end: 45008001, translationId: "kjv" },
    ]);
  });

  it("leaves out empty paragraphs, which Markdown has no way to write", () => {
    expect(docToMarkdown(doc(p(), p(text("One")), p(), p(), p(text("Two")), p()))).toBe("One\n\nTwo");
    expect(docToMarkdown(doc(p()))).toBe("");
    expect(docToMarkdown(doc())).toBe("");
  });

  it("escapes text that would otherwise read as Markdown or as a card", () => {
    const tricky = doc(
      p(text("[[John 3:16]]")),
      p(text("# not a heading")),
      p(text("1. not a list")),
      p(text("*not italic* and <b>not bold</b>")),
      p(text("- not a bullet")),
    );
    const markdown = docToMarkdown(tricky);
    expect(documentPassages(markdown, [])).toEqual([]);
    expect(markdownToDoc(markdown)).toEqual(tricky);
    expect(renderMarkdown(markdown)).not.toMatch(/<(h1|ol|ul|em|b)>/);
  });

  it("keeps spaces at the edge of bold or a link outside it, where CommonMark wants them", () => {
    const markdown = docToMarkdown(doc(p(text("Is "), text(" bold ", bold), text("here"))));
    expect(markdown).toBe("Is  **bold** here");
    expect(renderMarkdown(markdown)).toContain("<strong>bold</strong>");
  });

  it("writes a card back as it was written until the block changes", () => {
    expect(docToMarkdown(doc(passage("jn 3.16", "web", "[[jn 3.16|web]]")))).toBe("[[jn 3.16|web]]");
    // The translation was changed in the editor.
    expect(docToMarkdown(doc(passage("jn 3.16", "KJV", "[[jn 3.16|web]]")))).toBe("[[jn 3.16 | KJV]]");
    expect(passageSource({ reference: "Psalm 23", translation: null, source: null })).toBe("[[Psalm 23]]");
  });
});

describe("markdownToDoc", () => {
  it("reads back exactly what the editor wrote", () => {
    expect(markdownToDoc(docToMarkdown(EVERYTHING))).toEqual(
      // Read back, a card remembers its line.
      doc(
        ...EVERYTHING.content.map((node) =>
          node.type === "passage" ? { ...node, attrs: { ...node.attrs, source: passageSource(node.attrs as never) } } : node,
        ),
      ),
    );
  });

  it("is a fixed point: Markdown the editor writes comes back unchanged", () => {
    const markdown = docToMarkdown(EVERYTHING);
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it("reads cards with and without a translation, and keeps bad ones", () => {
    expect(markdownToDoc("[[John 3:16-18]]\n\n[[Romans 8:28-30 | KJV]]\n\n[[Romans 99:1]]").content).toEqual([
      passage("John 3:16-18", null, "[[John 3:16-18]]"),
      passage("Romans 8:28-30", "KJV", "[[Romans 8:28-30 | KJV]]"),
      passage("Romans 99:1", null, "[[Romans 99:1]]"),
    ]);
  });

  it("reads a card's line as text in a note, whose cards are not read", () => {
    expect(markdownToDoc("[[John 3:16]]", { passages: false }).content).toEqual([p(text("[[John 3:16]]"))]);
  });

  it("opens an empty document as one empty paragraph", () => {
    expect(markdownToDoc("")).toEqual(doc(p()));
    expect(markdownToDoc("  \n\n")).toEqual(doc(p()));
  });

  it("reads headings, lists, quotes and links", () => {
    expect(
      markdownToDoc(
        "# One\n\n## Two\n\n* a\n* [b](https://example.org) _c_\n\n2) x\n\n> quoted\n> on two lines\n\n***",
      ).content,
    ).toEqual([
      heading(1, text("One")),
      heading(2, text("Two")),
      { type: "bulletList", content: [item(p(text("a"))), item(p(text("b", link("https://example.org")), text(" "), text("c", italic)))] },
      { type: "orderedList", attrs: { start: 2 }, content: [item(p(text("x")))] },
      { type: "blockquote", content: [p(text("quoted on two lines"))] },
      { type: "horizontalRule" },
    ]);
  });
});

// Reflections written in the M8 text area, and what the editor makes of them.
const TEXTAREA = [
  "[[John 15:4-5 | BSB]]\n\n",
  "[[John 15:4-5 | BSB]]\n\nApart from him, **nothing**.\n\n<script>window.pwned = true</script>\n\n<img src=x onerror=\"window.pwned = true\">",
  "[[John 15:4-5 | BSB]]\n\nApart from him, **nothing**.\n\nTyped a moment before the reload.\n\n[[Psalm 46:1 | KJV]]",
  "[[Romans 99:1]]\n\n[[Romans 15:5-6]]",
  "A paragraph\nthat wraps\nby hand.\n\n- one\n- two\n\n  still two\n- three",
  "See [the vine][vine] and ![a vine][pic] too.\n\n[vine]: https://example.org/vine\n[pic]: https://example.org/vine.jpg",
  "Setext\n======\n\n    indented code\n\nA line with a hard break  \nand after.\n\n1. one\n1. two",
  "Mixed *emphasis **with strong** inside* it, and `inline code`.\n\n```\nfenced\n```\n\n~~~ts\ntilde fence\n~~~",
  "> [[John 3:16]]\n\nSee [[John 3:16]] for more.\n\n[[jn 3.16; 4:1-3|web]]",
  "Text right above a card\n[[Psalm 23]]\nand right below it.",
];

// The HTML of each block, with whitespace that HTML does not print evened out.
const printed = (markdown: string) =>
  renderMarkdown(markdown)
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim();

describe("Markdown from the M8 text area", () => {
  it.each(TEXTAREA)("opens and saves as what the page printed: %j", (markdown) => {
    const saved = docToMarkdown(markdownToDoc(markdown));
    // The same cards, and the same passages indexed.
    const translations = [
      { id: "bsb", abbrev: "BSB" },
      { id: "kjv", abbrev: "KJV" },
      { id: "web", abbrev: "WEB" },
    ];
    expect(documentPassages(saved, translations)).toEqual(documentPassages(markdown, translations));
    // Saved again, nothing changes.
    expect(docToMarkdown(markdownToDoc(saved))).toBe(saved);
    // Markdown that was already in the editor's own form is untouched.
    if (markdown.trim() === saved) expect(saved).toBe(markdown.trim());
  });

  it("prints the same words, links and emphasis after the round trip", () => {
    // (Raw HTML, below, comes back as a paragraph of text rather than bare text.)
    for (const markdown of [0, 2, 3, 4, 7, 9].map((i) => TEXTAREA[i])) {
      const saved = docToMarkdown(markdownToDoc(markdown));
      expect(printed(saved.replace(/^\[\[.*\]\]$/gm, ""))).toBe(
        printed(markdown.replace(/^\[\[.*\]\][ \t]*$/gm, "")),
      );
    }
  });

  it("keeps the HTML a writer typed as text", () => {
    const saved = docToMarkdown(markdownToDoc(TEXTAREA[1]));
    const html = renderMarkdown(saved);
    expect(html).toContain("&lt;script&gt;window.pwned = true&lt;/script&gt;");
    expect(html).not.toMatch(/<script|<img/);
  });

  it("reads reference links as links, and an image in a sentence as a block after it", () => {
    expect(markdownToDoc(TEXTAREA[5]).content).toEqual([
      p(text("See "), text("the vine", link("https://example.org/vine")), text(" and  too.")),
      { type: "image", attrs: { src: "https://example.org/vine.jpg", alt: "a vine", title: null } },
    ]);
  });

  it("reads soft line breaks as spaces and keeps hard ones", () => {
    expect(markdownToDoc(TEXTAREA[4]).content[0]).toEqual(p(text("A paragraph that wraps by hand.")));
    const [setext, codeBlock, broken, list] = markdownToDoc(TEXTAREA[6]).content;
    expect(setext).toEqual(heading(1, text("Setext")));
    expect(codeBlock).toEqual({ type: "codeBlock", attrs: { language: null }, content: [text("indented code")] });
    expect(broken).toEqual(p(text("A line with a hard break"), { type: "hardBreak" }, text("and after.")));
    expect(list).toMatchObject({ type: "orderedList", attrs: { start: 1 } });
  });
});
