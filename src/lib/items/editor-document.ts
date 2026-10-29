import type {
  Blockquote,
  Code,
  Definition,
  Heading,
  List,
  ListItem,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  ThematicBreak,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";

import { parseDocument } from "./cards";

// What the rich editor (src/components/editor) edits, and how it becomes the
// Markdown that is stored, and back.
//
// Storage does not change: `item.markdown` is CommonMark with passage cards
// on lines of their own (src/lib/items/cards.ts). The editor works on a
// document of blocks, the JSON of its ProseMirror schema; these two
// functions convert between the two:
//
//   markdownToDoc(markdown)  when an item opens
//   docToMarkdown(doc)       on every save
//
// Both sides are read by the same CommonMark parser as the public pages
// (micromark, through mdast-util-from-markdown), so what the editor shows is
// what renderMarkdown() prints. For everything the editor can make the round
// trip is exact: docToMarkdown(markdownToDoc(docToMarkdown(doc))) is
// docToMarkdown(doc), and markdownToDoc(docToMarkdown(doc)) is `doc` with
// its empty paragraphs gone (Markdown has no empty paragraph).
//
// Markdown written in the M8 text area may hold what the editor has no block
// for. It opens as the closest thing that prints the same: raw HTML (which
// the page shows as text) as text, a reference-style link as a link, soft
// line breaks as spaces, an image inside a sentence as an image block after
// it.

export type EditorMark =
  | { type: "bold" | "italic" | "code" }
  | { type: "link"; attrs: { href: string; title?: string | null } };

export type EditorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  text?: string;
  marks?: EditorMark[];
};

export type EditorDoc = EditorNode & { type: "doc"; content: EditorNode[] };

// The attributes of a passage block.
export type PassageAttrs = {
  // As written in the card: "John 3:16-18", or "jn 3.16" in an older one.
  reference: string;
  // The translation the card names (an abbreviation or an id), or null for
  // the site's default.
  translation: string | null;
  // The card's line as it was read, written back unchanged while the block
  // is; null for a block made in the editor.
  source: string | null;
};

// The card line for a passage block.
export function passageSource({ reference, translation, source }: PassageAttrs): string {
  if (source) {
    const [card] = parseDocument(source);
    if (
      card?.type === "card" &&
      card.reference === reference.trim() &&
      (card.translation ?? null) === (translation?.trim() || null)
    ) {
      return source;
    }
  }
  return translation?.trim() ? `[[${reference.trim()} | ${translation.trim()}]]` : `[[${reference.trim()}]]`;
}

// --- Markdown to the editor's document ---

type Definitions = Map<string, Definition>;

const MARK_ORDER = ["link", "bold", "italic", "code"] as const;

const sortMarks = (marks: EditorMark[]) =>
  [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));

const sameMarks = (a: readonly EditorMark[] = [], b: readonly EditorMark[] = []) =>
  a.length === b.length && a.every((mark, i) => JSON.stringify(mark) === JSON.stringify(b[i]));

function textNode(text: string, marks: EditorMark[]): EditorNode {
  return marks.length > 0 ? { type: "text", text, marks: sortMarks(marks) } : { type: "text", text };
}

// Inline content: text with marks, hard breaks, and the images found in it
// (which the editor holds as blocks of their own).
type Inline = { nodes: EditorNode[]; images: EditorNode[] };

function inline(
  children: readonly PhrasingContent[],
  marks: EditorMark[],
  definitions: Definitions,
  out: Inline,
): void {
  for (const child of children) {
    switch (child.type) {
      case "text":
        // A soft line break prints as a space.
        if (child.value) out.nodes.push(textNode(child.value.replace(/[ \t]*\n[ \t]*/g, " "), marks));
        break;
      case "html":
        // The page shows HTML as text.
        if (child.value) out.nodes.push(textNode(child.value.replace(/\s*\n\s*/g, " "), marks));
        break;
      case "inlineCode":
        out.nodes.push(textNode(child.value, [...marks, { type: "code" }]));
        break;
      case "break":
        out.nodes.push({ type: "hardBreak" });
        break;
      case "strong":
        inline(child.children, [...marks, { type: "bold" }], definitions, out);
        break;
      case "emphasis":
        inline(child.children, [...marks, { type: "italic" }], definitions, out);
        break;
      case "link":
        inline(
          child.children,
          [...marks.filter((mark) => mark.type !== "link"), linkMark(child.url, child.title)],
          definitions,
          out,
        );
        break;
      case "linkReference": {
        const definition = definitions.get(child.identifier);
        if (definition) {
          inline(
            child.children,
            [...marks.filter((mark) => mark.type !== "link"), linkMark(definition.url, definition.title)],
            definitions,
            out,
          );
        } else {
          // Not a link after all: the brackets are text, as on the page.
          out.nodes.push(textNode("[", marks));
          inline(child.children, marks, definitions, out);
          out.nodes.push(textNode("]", marks));
        }
        break;
      }
      case "image":
        out.images.push(imageNode(child.url, child.alt, child.title));
        break;
      case "imageReference": {
        const definition = definitions.get(child.identifier);
        if (definition) out.images.push(imageNode(definition.url, child.alt, definition.title));
        else if (child.alt) out.nodes.push(textNode(`![${child.alt}]`, marks));
        break;
      }
      default:
        break;
    }
  }
}

function linkMark(href: string, title?: string | null): EditorMark {
  return { type: "link", attrs: title ? { href, title } : { href } };
}

function imageNode(src: string, alt?: string | null, title?: string | null): EditorNode {
  return { type: "image", attrs: { src, alt: alt || null, title: title || null } };
}

// Joins neighbouring text with the same marks, and trims the ends of a block.
function tidy(nodes: EditorNode[]): EditorNode[] {
  const joined: EditorNode[] = [];
  for (const node of nodes) {
    const last = joined.at(-1);
    if (node.type === "text" && last?.type === "text" && sameMarks(last.marks, node.marks)) {
      joined[joined.length - 1] = { ...last, text: last.text! + node.text! };
    } else {
      joined.push({ ...node });
    }
  }
  const first = joined[0];
  if (first?.type === "text") first.text = first.text!.replace(/^\s+/, "");
  const end = joined.at(-1);
  if (end?.type === "text") end.text = end.text!.replace(/\s+$/, "");
  // A hard break at the end of a block prints nothing.
  while (joined.at(-1)?.type === "hardBreak") joined.pop();
  return joined.filter((node) => node.type !== "text" || node.text);
}

function textBlock(type: string, children: readonly PhrasingContent[], definitions: Definitions, attrs?: Record<string, unknown>) {
  const out: Inline = { nodes: [], images: [] };
  inline(children, [], definitions, out);
  const content = tidy(out.nodes);
  const block: EditorNode = { type, ...(attrs && { attrs }), ...(content.length > 0 && { content }) };
  return { block, images: out.images };
}

function blocks(children: readonly RootContent[], definitions: Definitions): EditorNode[] {
  return children.flatMap((child) => block(child, definitions));
}

function block(node: RootContent, definitions: Definitions): EditorNode[] {
  switch (node.type) {
    case "paragraph": {
      const { block: paragraph, images } = textBlock("paragraph", node.children, definitions);
      return paragraph.content ? [paragraph, ...images] : images;
    }
    case "heading": {
      const { block: heading, images } = textBlock("heading", node.children, definitions, {
        level: node.depth,
      });
      return [heading, ...images];
    }
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "blockquote": {
      const content = blocks(node.children, definitions);
      return [{ type: "blockquote", content: content.length > 0 ? content : [{ type: "paragraph" }] }];
    }
    case "list": {
      const items = node.children.map((item): EditorNode => {
        const content = blocks(item.children, definitions);
        // An item opens with a paragraph, even an empty one.
        if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
        return { type: "listItem", content };
      });
      return [
        node.ordered
          ? { type: "orderedList", attrs: { start: node.start ?? 1 }, content: items }
          : { type: "bulletList", content: items },
      ];
    }
    case "code":
      return [
        {
          type: "codeBlock",
          attrs: { language: node.lang || null },
          ...(node.value && { content: [{ type: "text", text: node.value }] }),
        },
      ];
    case "html": {
      const text = node.value.replace(/\s*\n\s*/g, " ").trim();
      return text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [];
    }
    default:
      // Definitions are read into the links that use them.
      return [];
  }
}

function collectDefinitions(tree: Nodes, into: Definitions) {
  if (tree.type === "definition") {
    if (!into.has(tree.identifier)) into.set(tree.identifier, tree);
    return;
  }
  if ("children" in tree) for (const child of tree.children) collectDefinitions(child, into);
}

export type DocOptions = {
  // Whether the document has passage blocks: a reflection's does; a note's
  // Markdown is printed without reading cards (src/lib/items/feed.ts), so
  // there a card's line is text.
  passages?: boolean;
};

// The editor's document for stored Markdown.
export function markdownToDoc(markdown: string, { passages = true }: DocOptions = {}): EditorDoc {
  const segments = passages
    ? parseDocument(markdown)
    : markdown.trim()
      ? [{ type: "markdown" as const, text: markdown }]
      : [];
  const trees = segments.map((segment) =>
    segment.type === "markdown" ? fromMarkdown(segment.text) : undefined,
  );
  const definitions: Definitions = new Map();
  for (const tree of trees) if (tree) collectDefinitions(tree, definitions);

  const content = segments.flatMap((segment, i): EditorNode[] =>
    segment.type === "card"
      ? [
          {
            type: "passage",
            attrs: {
              reference: segment.reference,
              translation: segment.translation ?? null,
              source: segment.source,
            } satisfies PassageAttrs,
          },
        ]
      : blocks(trees[i]!.children, definitions),
  );
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// --- The editor's document to Markdown ---

const isLink = (mark: EditorMark): mark is Extract<EditorMark, { type: "link" }> =>
  mark.type === "link";

// A run of inline content and the marks on all of it.
type Run = { node: EditorNode; marks: EditorMark[] };

const markKey = (mark: EditorMark) =>
  isLink(mark) ? `link:${mark.attrs.href}:${mark.attrs.title ?? ""}` : mark.type;

// Marks as nested mdast, links outermost (as MARK_ORDER has them), with neighbouring runs that share a mark inside one element. Spaces at the
// edges of bold, italic or a link go outside it: CommonMark does not read
// "** bold**" as bold.
function phrasing(runs: readonly Run[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let i = 0;
  while (i < runs.length) {
    const run = runs[i];
    const outer = MARK_ORDER.find((type) => run.marks.some((mark) => mark.type === type));
    if (!outer) {
      out.push(leaf(run.node));
      i++;
      continue;
    }
    const mark = run.marks.find((candidate) => candidate.type === outer)!;
    const key = markKey(mark);
    let j = i;
    while (j < runs.length && runs[j].marks.some((other) => markKey(other) === key)) j++;
    const inner = runs.slice(i, j).map((each) => ({
      ...each,
      marks: each.marks.filter((other) => markKey(other) !== key),
    }));
    i = j;
    if (outer === "code") {
      out.push({ type: "inlineCode", value: inner.map((each) => each.node.text ?? "").join("") });
      continue;
    }
    const before = peel(inner, 0, /^\s+/);
    const after = peel(inner, inner.length - 1, /\s+$/);
    if (before) out.push({ type: "text", value: before });
    const children = phrasing(inner.filter((each) => each.node.type !== "text" || each.node.text));
    if (children.length > 0) {
      if (outer === "link" && isLink(mark)) {
        out.push({ type: "link", url: mark.attrs.href, title: mark.attrs.title || null, children });
      } else {
        out.push({ type: outer === "bold" ? "strong" : "emphasis", children } as PhrasingContent);
      }
    }
    if (after) out.push({ type: "text", value: after });
  }
  return out;
}

// Takes the spaces `pattern` matches off one end of a run of text (not code)
// and returns them.
function peel(runs: Run[], at: number, pattern: RegExp): string {
  const run = runs[at];
  if (!run || run.node.type !== "text" || run.marks.some((mark) => mark.type === "code")) return "";
  const spaces = pattern.exec(run.node.text ?? "")?.[0] ?? "";
  if (spaces) runs[at] = { ...run, node: { ...run.node, text: run.node.text!.replace(pattern, "") } };
  return spaces;
}

function leaf(node: EditorNode): PhrasingContent {
  if (node.type === "hardBreak") return { type: "break" };
  return { type: "text", value: node.text ?? "" };
}

function inlineContent(node: EditorNode): PhrasingContent[] {
  return phrasing((node.content ?? []).map((child) => ({ node: child, marks: child.marks ?? [] })));
}

const hasText = (node: EditorNode) =>
  (node.content ?? []).some((child) => (child.type === "text" && child.text?.trim()) || child.type !== "text");

function toMdast(node: EditorNode): RootContent[] {
  switch (node.type) {
    case "paragraph":
      return hasText(node) ? [{ type: "paragraph", children: inlineContent(node) } satisfies Paragraph] : [];
    case "heading": {
      const depth = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 6) as Heading["depth"];
      return hasText(node) ? [{ type: "heading", depth, children: inlineContent(node) } satisfies Heading] : [];
    }
    case "horizontalRule":
      return [{ type: "thematicBreak" } satisfies ThematicBreak];
    case "image": {
      const src = String(node.attrs?.src ?? "").trim();
      if (!src) return [];
      return [
        {
          type: "paragraph",
          children: [
            {
              type: "image",
              url: src,
              alt: (node.attrs?.alt as string | null) || "",
              title: (node.attrs?.title as string | null) || null,
            },
          ],
        },
      ];
    }
    case "blockquote": {
      const children = (node.content ?? []).flatMap(toMdast);
      return children.length > 0 ? [{ type: "blockquote", children } as Blockquote] : [];
    }
    case "bulletList":
    case "orderedList": {
      const items = (node.content ?? []).map(
        (item): ListItem => ({
          type: "listItem",
          spread: false,
          children: (item.content ?? []).flatMap(toMdast) as ListItem["children"],
        }),
      );
      if (items.length === 0) return [];
      const ordered = node.type === "orderedList";
      return [
        {
          type: "list",
          ordered,
          start: ordered ? Number(node.attrs?.start ?? 1) : null,
          spread: false,
          children: items,
        } satisfies List,
      ];
    }
    case "codeBlock":
      return [
        {
          type: "code",
          lang: (node.attrs?.language as string | null) || null,
          value: (node.content ?? []).map((child) => child.text ?? "").join(""),
        } satisfies Code,
      ];
    default:
      return [];
  }
}

const MARKDOWN_OPTIONS = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  rule: "-",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  incrementListMarker: true,
} as const;

// The Markdown to store for the editor's document.
export function docToMarkdown(doc: EditorNode): string {
  const parts: string[] = [];
  let run: RootContent[] = [];
  const flush = () => {
    if (run.length > 0) {
      const markdown = toMarkdown({ type: "root", children: run } satisfies Root, MARKDOWN_OPTIONS).trim();
      if (markdown) parts.push(markdown);
    }
    run = [];
  };
  for (const node of doc.content ?? []) {
    if (node.type === "passage") {
      flush();
      const attrs = node.attrs as PassageAttrs | undefined;
      if (attrs?.reference?.trim()) parts.push(passageSource(attrs));
      continue;
    }
    run.push(...toMdast(node));
  }
  flush();
  return parts.join("\n\n");
}
