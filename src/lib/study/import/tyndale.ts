import { escapeHtml, sanitizeStudyHtml, studyText, tokenize, versesAttribute } from "../html";
import type { CommentaryRecord } from "../types";
import { parseTyndaleRange } from "./refs";

// Tyndale Open Study Notes: StudyNotes.xml of the publisher's archive, one
// <item> per note,
//
//   <item name="John.3.16-21" typename="StudyNote" ...>
//   <refs>John.3.16-21</refs>
//   <body><p class="sn-text">...</p></body>
//   </item>
//
// `name` is the passage the note is about. `refs` is usually the same, but
// for a note on a long section it is only where the note is printed
// ("Gen.11.27" for the note on Gen.11.27-25.11), so `name` is what is read.

// One note as the file has it.
export type TyndaleItem = { name: string; refs: string; body: string };

const ITEM =
  /<item\s+name="([^"]*)"\s+typename="StudyNote"[^>]*>\s*<refs>([^<]*)<\/refs>\s*<body>([\s\S]*?)<\/body>\s*<\/item>/g;

export function parseTyndaleItems(xml: string): TyndaleItem[] {
  return [...xml.matchAll(ITEM)].map(([, name, refs, body]) => ({ name, refs, body }));
}

// Tyndale's classes (the archive's _classes.txt) as the tags of ../html.ts.
const SPAN: Record<string, string> = {
  "sn-ref": '<span class="ref">',
  "sn-excerpt": '<span class="excerpt">',
  "sn-excerpt-roman": '<span class="excerpt">',
  "sn-excerpt-sc": '<span class="sc">',
  "sn-excerpt-divine-name": '<span class="sc">',
  "sn-ref-sc": '<span class="sc">',
  "sn-sc": '<span class="sc">',
  sc: '<span class="sc">',
  "sc-ital": '<span class="sc">',
  era: '<span class="sc">',
  "bold-era": '<span class="sc">',
  "divine-name": '<span class="sc">',
  "divine-name-ital": '<span class="sc">',
  "bold-sc": "<b>",
  bold: "<b>",
  "ital-bold": "<b>",
  ital: "<i>",
  hebrew: "<i>",
  greek: "<i>",
  aramaic: "<i>",
  latin: "<i>",
  sup: "<sup>",
  sub: "<sub>",
};

const closing = (open: string) => `</${/^<(\w+)/.exec(open)![1]}>`;

// A note's body as stored HTML. Its links to passages ("?bref=John.3.16")
// become passage links; links to Tyndale's other articles, which are not
// imported, keep their words and lose the link.
export function tyndaleToHtml(body: string): string {
  const out: string[] = [];
  const open: Record<string, string[]> = { span: [], a: [] };
  for (const token of tokenize(body)) {
    if (token.type === "text") out.push(escapeHtml(token.text));
    else if (token.type === "open") {
      const { tag, attrs } = token;
      if (tag === "p") out.push("<p>");
      else if (tag in open && !token.selfClosing) {
        let html = "<span>";
        if (tag === "span") html = SPAN[attrs.class] ?? html;
        else {
          const bref = /^\?bref=(.+)$/.exec(attrs.href ?? "")?.[1];
          const range = bref ? parseTyndaleRange(bref) : undefined;
          if (range) html = `<a data-verses="${versesAttribute(range)}">`;
        }
        open[tag].push(html);
        out.push(html);
      }
    } else if (token.tag === "p") out.push("</p>");
    else if (token.tag in open) {
      const html = open[token.tag].pop();
      if (html) out.push(closing(html));
    }
  }
  return sanitizeStudyHtml(out.join(""));
}

// The notes as commentary records, and the items whose passage is not in the
// canon. Notes on the same passage are joined in the file's order.
export function normalizeTyndaleItems(items: readonly TyndaleItem[]): {
  records: CommentaryRecord[];
  skipped: string[];
} {
  const records = new Map<string, CommentaryRecord>();
  const skipped: string[] = [];
  for (const item of items) {
    const range =
      parseTyndaleRange(item.name, { clamp: true }) ??
      parseTyndaleRange(item.refs, { clamp: true });
    const html = tyndaleToHtml(item.body);
    if (!range || !studyText(html)) {
      skipped.push(item.name);
      continue;
    }
    const key = `${range.start}-${range.end}`;
    const record = records.get(key);
    if (record) record.html += html;
    else records.set(key, { verseStart: range.start, verseEnd: range.end, html });
  }
  return {
    records: [...records.values()].sort(
      (a, b) => a.verseStart - b.verseStart || b.verseEnd - a.verseEnd,
    ),
    skipped,
  };
}
