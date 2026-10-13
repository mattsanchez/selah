import { isVerseId, type VerseRange } from "@/lib/bible/verse-id";

// The HTML of commentary and study notes.
//
// The sources come as markup we did not write, so nothing of theirs is ever
// printed as it arrives. Everything passes through transform() below, which
// reads the markup as tokens and writes its own: a fixed set of tags, no
// attribute of the source's, and every piece of text escaped. The importers
// store its output (sanitizeStudyHtml), and the page passes what was stored
// through it once more (renderStudyHtml) before printing it.
//
// The tags that survive:
//
//   <p> <h4>                     blocks; they do not nest
//   <i> <b> <sup> <sub> <br>
//   <span class="sc">            small capitals
//   <span class="excerpt">       the words of the verse a note is about
//   <span class="ref">           the reference a note opens with
//   <a data-verses="S-E">        a link to a passage, as two verse ids
//
// A stored link has no address. renderStudyHtml() gives it one, so a link
// always goes to the reader and keeps the translation on show.

const BLOCKS = new Set(["p", "h4"]);
const INLINES = new Set(["i", "b", "sup", "sub", "span", "a"]);
const SPAN_CLASSES = new Set(["sc", "excerpt", "ref"]);
// Tags whose text is not text to print.
const SKIPPED = new Set(["script", "style", "head", "title", "template"]);

export type Token =
  | { type: "open"; tag: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: "close"; tag: string }
  | { type: "text"; text: string };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code =
      name[1] === "x" || name[1] === "X"
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<|[^<]+/g;
const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// Markup as a flat list of tags and text, with entities decoded. Lenient: it
// never throws, and anything that is not a tag is text.
export function tokenize(markup: string): Token[] {
  const tokens: Token[] = [];
  for (const match of markup.matchAll(TOKEN)) {
    const [whole, slash, name, rest] = match;
    if (whole.startsWith("<!--")) continue;
    if (name === undefined) {
      tokens.push({ type: "text", text: decodeEntities(whole) });
    } else if (slash) {
      tokens.push({ type: "close", tag: name.toLowerCase() });
    } else {
      const attrs: Record<string, string> = {};
      for (const [, key, double, single] of rest.matchAll(ATTRIBUTE)) {
        attrs[key] = decodeEntities(double ?? single ?? "");
      }
      tokens.push({
        type: "open",
        tag: name.toLowerCase(),
        attrs,
        selfClosing: rest.trimEnd().endsWith("/"),
      });
    }
  }
  return tokens;
}

// "43003016-43003018" as a range of canonical verse ids.
export function parseVerses(value: string | undefined): VerseRange | undefined {
  const match = /^(\d{7,8})-(\d{7,8})$/.exec(value ?? "");
  if (!match) return undefined;
  const range = { start: Number(match[1]), end: Number(match[2]) };
  return isVerseId(range.start) && isVerseId(range.end) && range.start <= range.end
    ? range
    : undefined;
}

export const versesAttribute = (range: VerseRange) => `${range.start}-${range.end}`;

type TransformOptions = {
  // The attributes of a link to a passage, already escaped.
  link: (range: VerseRange) => string;
  // Stop at the end of the block in which this many characters of text have
  // been written, or in the middle of one twice as long.
  limit?: number;
};

function transform(
  markup: string,
  { link, limit }: TransformOptions,
): { html: string; truncated: boolean } {
  const out: string[] = [];
  // Open elements, innermost last. A tag that was dropped is kept here with
  // `written: false`, so that its closing tag closes it and nothing else.
  const stack: { tag: string; written: boolean }[] = [];
  // Where the open block starts in `out`, and whether it has anything in it.
  let blockAt = -1;
  let blockHasContent = false;
  let written = 0;
  let stopped = false;
  let truncated = false;
  let skipping: string | undefined;

  const closeTo = (depth: number) => {
    while (stack.length > depth) {
      const top = stack.pop()!;
      if (!top.written) continue;
      if (BLOCKS.has(top.tag)) {
        if (blockHasContent) out.push(`</${top.tag}>`);
        else out.length = blockAt;
        blockAt = -1;
        if (limit !== undefined && written >= limit) stopped = true;
      } else {
        out.push(`</${top.tag}>`);
      }
    }
  };
  const inBlock = () => stack.some((open) => open.written && BLOCKS.has(open.tag));
  const openBlock = (tag: string) => {
    closeTo(0);
    if (stopped) return;
    blockAt = out.length;
    blockHasContent = false;
    out.push(`<${tag}>`);
    stack.push({ tag, written: true });
  };

  for (const token of tokenize(markup)) {
    if (skipping) {
      if (token.type === "close" && token.tag === skipping) skipping = undefined;
      continue;
    }
    if (stopped) {
      // Only looking for whether anything was left out.
      if (token.type === "text" && token.text.trim()) {
        truncated = true;
        break;
      }
      continue;
    }

    if (token.type === "text") {
      if (!inBlock()) {
        if (!token.text.trim()) continue;
        openBlock("p");
      }
      let text = blockHasContent ? token.text : token.text.trimStart();
      if (!text) continue;
      if (limit !== undefined && written + text.length > limit * 2) {
        const room = Math.max(0, limit * 2 - written);
        text = `${text.slice(0, room).replace(/\s+\S*$/, "")}…`;
        truncated = true;
        stopped = true;
      }
      out.push(escapeHtml(text));
      written += text.length;
      blockHasContent = true;
      if (stopped) {
        closeTo(0);
        break;
      }
    } else if (token.type === "open") {
      const { tag, attrs } = token;
      if (SKIPPED.has(tag)) {
        if (!token.selfClosing) skipping = tag;
      } else if (BLOCKS.has(tag)) {
        openBlock(tag);
        if (token.selfClosing) closeTo(0);
      } else if (tag === "br") {
        if (inBlock() && blockHasContent) out.push("<br>");
      } else if (INLINES.has(tag)) {
        let attributes: string | undefined;
        if (tag === "span") {
          if (SPAN_CLASSES.has(attrs.class)) attributes = ` class="${attrs.class}"`;
        } else if (tag === "a") {
          const range = parseVerses(attrs["data-verses"]);
          if (range) attributes = ` ${link(range)}`;
        } else {
          attributes = "";
        }
        if (token.selfClosing) continue;
        if (attributes !== undefined && !inBlock()) openBlock("p");
        if (attributes !== undefined) out.push(`<${tag}${attributes}>`);
        stack.push({ tag, written: attributes !== undefined });
      } else if (!token.selfClosing) {
        // A tag we do not keep; its text stays.
        stack.push({ tag, written: false });
      }
    } else {
      const at = stack.findLastIndex((open) => open.tag === token.tag);
      if (at >= 0) closeTo(at);
    }
  }
  closeTo(0);
  return { html: out.join(""), truncated };
}

// Reduces markup to the tags above. What the importers store; running it on
// its own output changes nothing.
export function sanitizeStudyHtml(markup: string): string {
  return transform(markup, {
    link: (range) => `data-verses="${versesAttribute(range)}"`,
  }).html;
}

// Stored HTML made ready to print: sanitized again, every passage link given
// its address, and cut short after about `limit` characters when one is
// given. `truncated` says whether anything was left out.
export function renderStudyHtml(
  html: string,
  options: { href: (range: VerseRange) => string; limit?: number },
): { html: string; truncated: boolean } {
  return transform(html, {
    link: (range) => `href="${escapeHtml(options.href(range))}"`,
    limit: options.limit,
  });
}

// The words alone, for search and retrieval: blocks become lines.
export function studyText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\/(p|h4)>|<br>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}
