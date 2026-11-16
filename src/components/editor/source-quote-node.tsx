"use client";

import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";

import { Credit } from "@/components/ask/ask-chat";
import {
  checkedQuote,
  quoteCredit,
  quoteNode,
  sourceQuoteNode,
  SOURCE_QUOTE,
  type QuotedWords,
  type SourceQuote,
} from "@/lib/ask/quote";

import { BlockTools } from "./block-tools";
import { placeBlock } from "./passage-node";

// A quote from Ask in a post: the words of a commentary or a study note and
// the credit the app writes for them (src/lib/ask/quote.ts). It is one unit,
// like a passage block: selected, dragged, moved, deleted and undone whole.
// Its words and its credit cannot be edited, split, or lifted out of the
// quote, so a quote never loses its credit, and a share-alike note never loses
// what makes its post print the license notice (src/lib/items/share-alike.ts).
// To say something else, the writer writes around it.
//
// It is stored as the blockquote it has always been (quoteNode), and read
// back from that blockquote when the post opens (src/lib/items/editor-document.ts).
//
// To put one in a post from code:
//
//   editor.commands.insertQuote(quote)
//
// It goes where the cursor is, as a passage does (placeBlock).

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sourceQuote: {
      insertQuote: (quote: SourceQuote | QuotedWords) => ReturnType;
    };
  }
}

const quoteOf = (attrs: Record<string, unknown>) => checkedQuote(attrs.quote);

// The words, then the credit, as copied out of the editor.
const creditSpec = (quote: QuotedWords): DOMOutputSpec[] =>
  quoteCredit(quote).map((part) => {
    const link = part.marks?.find((mark) => mark.type === "link");
    return link?.type === "link" ? ["a", { href: link.attrs.href }, part.text ?? ""] : ["span", {}, part.text ?? ""];
  });

const wordsOf = (quote: QuotedWords) =>
  (quoteNode(quote).content ?? []).slice(0, -1).map((paragraph) => paragraph.content?.[0]?.text ?? "");

export const SourceQuoteNode = Node.create({
  name: SOURCE_QUOTE,
  // Its own group: it sits only at the top of a post, between blocks, and
  // nothing (a quote, a list) can wrap it.
  group: SOURCE_QUOTE,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      quote: { default: null, rendered: false },
    };
  },

  // How it is copied and pasted, inside the editor or between posts. A paste
  // is taken only when its quote is one the app could have written.
  parseHTML() {
    return [
      {
        tag: "figure[data-source-quote]",
        getAttrs: (element) => {
          try {
            const quote = checkedQuote(JSON.parse(element.getAttribute("data-source-quote") ?? ""));
            return quote ? { quote } : false;
          } catch {
            return false;
          }
        },
      },
    ];
  },
  renderHTML({ node }) {
    const quote = quoteOf(node.attrs);
    if (!quote) return ["figure", {}];
    return [
      "figure",
      { "data-source-quote": JSON.stringify(quote) },
      ["blockquote", {}, ...wordsOf(quote).map((line): DOMOutputSpec => ["p", {}, line])],
      ["figcaption", {}, ...creditSpec(quote)],
    ];
  },
  renderText({ node }) {
    const quote = quoteOf(node.attrs);
    if (!quote) return "";
    const credit = quoteCredit(quote)
      .map((part) => part.text ?? "")
      .join("");
    return [...wordsOf(quote), credit].join("\n\n");
  },

  addNodeView() {
    return ReactNodeViewRenderer(SourceQuoteView);
  },

  addCommands() {
    return {
      insertQuote:
        (quote) =>
        ({ state, tr }) => {
          // Should a quote ever be one the block cannot hold, it goes in as
          // the plain blockquote it is stored as, credit and all.
          const node = checkedQuote(quote) ? sourceQuoteNode(quote) : quoteNode(quote);
          placeBlock(state, tr, state.schema.nodeFromJSON(node));
          return true;
        },
    };
  },
});

function SourceQuoteView({ node, editor, getPos, selected, deleteNode }: ReactNodeViewProps) {
  const quote = quoteOf(node.attrs);
  if (!quote) return <NodeViewWrapper as="figure" />;

  return (
    <NodeViewWrapper
      as="figure"
      data-source-quote={quote.sourceId}
      data-selected={selected ? "" : undefined}
      aria-label={`Quote from ${quote.label} on ${quote.reference}`}
      className="passage-block source-quote-block group"
    >
      <div contentEditable={false} suppressContentEditableWarning>
        <BlockTools
          editor={editor}
          node={node}
          getPos={getPos}
          deleteNode={deleteNode}
          label={`Quote from ${quote.label}`}
          removeLabel="Remove quote"
        />
        <blockquote>
          {wordsOf(quote).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </blockquote>
        <figcaption data-quote-credit className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">
          <Credit quote={quote} newTab />
        </figcaption>
      </div>
    </NodeViewWrapper>
  );
}
