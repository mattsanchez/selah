import { getSchema } from "@tiptap/core";
import { createParagraphNear, deleteSelection, lift, selectNodeBackward, setBlockType, wrapIn } from "@tiptap/pm/commands";
import { history, undo } from "@tiptap/pm/history";
import { Node as PmNode, type Schema } from "@tiptap/pm/model";
import { wrapInList } from "@tiptap/pm/schema-list";
import { EditorState, NodeSelection, TextSelection, type Command } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { checkedQuote, makeQuote, quoteNode, readSourceQuote, sourceQuoteNode, type QuotedWords } from "@/lib/ask/quote";
import { docToMarkdown, markdownToDoc, type EditorNode } from "@/lib/items/editor-document";
import { shareAlikeQuotes } from "@/lib/items/share-alike";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";

import { NoteDocument, PassageNode, PostDocument } from "./passage-node";
import { SourceQuoteNode } from "./source-quote-node";

// A quote from Ask in the editor: one unit whose credit cannot be taken from
// its words, stored exactly as before. These run the editor's real schema and
// ProseMirror's own commands (the ones its keys and toolbar call), without a
// browser; e2e/ask.spec.ts does the same through the page.

const reflectionSchema = getSchema([PostDocument, PassageNode, SourceQuoteNode, StarterKit.configure({ document: false })]);
const noteSchema = getSchema([NoteDocument, SourceQuoteNode, StarterKit.configure({ document: false })]);

const TYNDALE_CREDIT =
  "— Adapted from [Tyndale Open Study Notes](https://tyndaleopenresources.com/) (Protestant evangelical tradition) on [John 3:16](/read/john-3.16), © 2022 Tyndale House Publishers, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This quoted note is under that license; the rest of this post is not.";

// A post as the editor saved it before quotes were one block: the bytes
// that are in `item.markdown` today.
const SAVED_QUOTE = [
  "> The truth that God loved the world is basic to Christian understanding (1 Jn 4:9-10). \\[…]",
  ">",
  `> ${TYNDALE_CREDIT}`,
].join("\n");
const SAVED = ["My own first thought.", SAVED_QUOTE, "More of my own."].join("\n\n");

const HENRY_SAVED = [
  "> Love is the source.",
  ">",
  "> — Matthew Henry (English Puritan tradition), Commentary on the Whole Bible, on [John 3:16](/read/john-3.16). Public domain.",
].join("\n");

function open(markdown: string, schema: Schema = reflectionSchema) {
  const doc = PmNode.fromJSON(schema, markdownToDoc(markdown, { passages: schema === reflectionSchema }));
  doc.check();
  return EditorState.create({ doc, plugins: [history()] });
}

const stored = (state: EditorState) => docToMarkdown(state.doc.toJSON() as EditorNode);
const types = (state: EditorState) => state.doc.content.content.map((node) => node.type.name);

// Runs a command as a key or a button would; whether it did anything.
function run(state: EditorState, command: Command): { ok: boolean; state: EditorState } {
  let next = state;
  const ok = command(state, (tr) => {
    next = next.apply(tr);
  });
  return { ok, state: next };
}

const quotePos = (state: EditorState) => {
  let at = -1;
  state.doc.forEach((node, offset) => {
    if (node.type.name === "sourceQuote" && at < 0) at = offset;
  });
  return at;
};
const selectQuote = (state: EditorState) =>
  state.apply(state.tr.setSelection(NodeSelection.create(state.doc, quotePos(state))));

// Either the quote is there with its whole credit, or none of it is.
function wholeOrGone(markdown: string) {
  const words = markdown.includes("God loved the world");
  const credit = markdown.includes(TYNDALE_CREDIT);
  expect(words).toBe(credit);
  if (words) expect(shareAlikeQuotes(markdown).map((source) => source.id)).toEqual(["tyndale"]);
}

describe("a saved quote, opened", () => {
  it("is one block, and is stored again byte for byte", () => {
    const state = open(SAVED);
    expect(types(state)).toEqual(["paragraph", "sourceQuote", "paragraph"]);
    expect(state.doc.child(1).attrs.quote).toMatchObject({ sourceId: "tyndale", reference: "John 3:16", href: "/read/john-3.16" });
    expect(stored(state)).toBe(SAVED);
  });

  it("is one block for a public-domain commentator too", () => {
    const state = open(HENRY_SAVED);
    expect(types(state)).toEqual(["sourceQuote"]);
    expect(state.doc.child(0).attrs.quote).toMatchObject({ sourceId: "matthew-henry", license: "Public domain" });
    expect(stored(state)).toBe(HENRY_SAVED);
  });

  it("is one block in a note, which has no passage blocks", () => {
    const state = open(SAVED, noteSchema);
    expect(types(state)).toEqual(["paragraph", "sourceQuote", "paragraph"]);
    expect(stored(state)).toBe(SAVED);
  });
});

describe("what stays an ordinary blockquote", () => {
  const variants: [string, string][] = [
    ["the writer's own quotation that names Tyndale", "> As the Tyndale Open Study Notes put it, love is first."],
    ["a quote whose credit was deleted", "> The truth that God loved the world."],
    ["a quote whose credit was reworded", "> The truth.\n>\n> — Adapted from Tyndale notes, CC BY-SA 4.0."],
    ["a credit with one word changed", `> The truth.\n>\n> ${TYNDALE_CREDIT.replace("rest of this post", "rest of my post")}`],
    ["a credit pointing somewhere else", `> The truth.\n>\n> ${TYNDALE_CREDIT.replace("https://tyndaleopenresources.com/", "https://example.org/")}`],
    ["a credit with another license link", `> The truth.\n>\n> ${TYNDALE_CREDIT.replace("by-sa/4.0", "by/4.0")}`],
    ["a credit alone, split from its words", `> ${TYNDALE_CREDIT}`],
    ["words with formatting the app never writes", `> The *truth*.\n>\n> ${TYNDALE_CREDIT}`],
    ["a quote with a list in it", `> - The truth.\n>\n> ${TYNDALE_CREDIT}`],
    ["a quote inside a list", `- > The truth.\n  >\n  > ${TYNDALE_CREDIT}`],
    ["a quote inside a quote", `> > The truth.\n> >\n> > ${TYNDALE_CREDIT}`],
  ];

  for (const [name, markdown] of variants) {
    it(name, () => {
      const state = open(markdown);
      let found = false;
      state.doc.descendants((node) => {
        if (node.type.name === "sourceQuote") found = true;
      });
      expect(found).toBe(false);
      expect(stored(state)).toBe(markdown);
    });
  }
});

describe("editing around a quote", () => {
  it("cannot wrap it in a quote or a list, or lift it out", () => {
    const selected = selectQuote(open(SAVED));
    expect(run(selected, wrapIn(reflectionSchema.nodes.blockquote)).ok).toBe(false);
    expect(run(selected, wrapInList(reflectionSchema.nodes.bulletList)).ok).toBe(false);
    expect(run(selected, setBlockType(reflectionSchema.nodes.paragraph)).ok).toBe(false);
    expect(stored(run(selected, lift).state)).toBe(SAVED);
  });

  it("is not wrapped with the text around it either", () => {
    const state = open(SAVED);
    const across = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3, state.doc.content.size - 3)));
    expect(run(across, wrapIn(reflectionSchema.nodes.blockquote)).ok).toBe(false);
  });

  it("is deleted whole with a selection that reaches into the text on both sides", () => {
    const state = open(SAVED);
    const across = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5, state.doc.content.size - 5)));
    const { state: after } = run(across, deleteSelection);
    expect(types(after)).not.toContain("sourceQuote");
    wholeOrGone(stored(after));
  });

  it("is selected by Backspace from the text after it, then deleted whole, and Undo brings it back as it was", () => {
    const state = open(SAVED);
    const after = quotePos(state) + state.doc.child(1).nodeSize;
    const atStart = state.apply(state.tr.setSelection(TextSelection.create(state.doc, after + 1)));
    const selected = run(atStart, selectNodeBackward).state;
    expect(selected.selection).toBeInstanceOf(NodeSelection);
    expect((selected.selection as NodeSelection).node.type.name).toBe("sourceQuote");

    const deleted = run(selected, deleteSelection).state;
    expect(types(deleted)).toEqual(["paragraph", "paragraph"]);
    wholeOrGone(stored(deleted));

    const back = run(deleted, undo).state;
    expect(stored(back)).toBe(SAVED);
  });

  it("puts a new paragraph after it on Enter, and is not split", () => {
    const { ok, state } = run(selectQuote(open(SAVED)), createParagraphNear);
    expect(ok).toBe(true);
    expect(types(state)).toEqual(["paragraph", "sourceQuote", "paragraph", "paragraph"]);
    expect(stored(state)).toBe(SAVED);
  });

  it("is replaced whole by typing over it", () => {
    const selected = selectQuote(open(SAVED));
    const typed = selected.apply(selected.tr.insertText("x"));
    wholeOrGone(stored(typed));
  });

  it("moves whole", () => {
    const state = open(SAVED);
    const pos = quotePos(state);
    const node = state.doc.nodeAt(pos)!;
    const moved = state.apply(state.tr.delete(pos, pos + node.nodeSize).insert(state.doc.content.size - node.nodeSize, node));
    expect(types(moved)).toEqual(["paragraph", "paragraph", "sourceQuote"]);
    expect(stored(moved)).toBe(`My own first thought.\n\nMore of my own.\n\n${SAVED_QUOTE}`);
    wholeOrGone(stored(moved));
  });
});

describe("a quote put in from Ask", () => {
  const source = COMMENTARY_SOURCES.find((each) => each.id === "tyndale")!;
  const quote = makeQuote(
    { id: source.id, name: source.name, license: source.license, attribution: source.attribution, sourceUrl: source.sourceUrl },
    { reference: "John 3:16", href: "/read/john-3.16" },
    { text: "First *part* [of it].\n# Not a heading\n1. Not a list > nor a quote \\ nor `code` <b>nor html</b> […]", shortened: true },
  );

  it("holds only what its credit is made from", () => {
    const node = sourceQuoteNode(quote);
    expect(Object.keys(node.attrs!.quote as object).sort()).toEqual(
      ["href", "label", "license", "reference", "shareAlike", "sourceId", "sourceUrl", "text"],
    );
  });

  it("is stored as the blockquote the editor always wrote, and opens as the same block", () => {
    const doc = { type: "doc", content: [sourceQuoteNode(quote)] };
    const markdown = docToMarkdown(doc);
    expect(markdown).toBe(docToMarkdown({ type: "doc", content: [quoteNode(quote)] }));
    const state = open(markdown);
    expect(state.doc.toJSON()).toEqual(doc);
    expect(stored(state)).toBe(markdown);
  });

  it("is checked against the app's own credit when it comes from a paste", () => {
    const words = sourceQuoteNode(quote).attrs!.quote as QuotedWords;
    expect(checkedQuote(words)).toEqual(words);
    expect(checkedQuote({ ...words, shareAlike: undefined })).toBeUndefined();
    expect(checkedQuote({ ...words, shareAlike: { ...words.shareAlike!, licenseUrl: "https://example.org/" } })).toBeUndefined();
    expect(checkedQuote({ ...words, sourceId: "someone-else" })).toBeUndefined();
    expect(checkedQuote({ ...words, text: 42 })).toBeUndefined();
    expect(checkedQuote(null)).toBeUndefined();
    expect(readSourceQuote({ type: "paragraph" })).toBeUndefined();
  });
});
