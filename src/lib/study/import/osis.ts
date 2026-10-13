import { escapeHtml, sanitizeStudyHtml, tokenize, versesAttribute } from "../html";
import { parseOsisRange } from "./refs";

// The OSIS markup of a SWORD commentary module, as the HTML of ../html.ts.
//
// A module entry is a slice of one long document, so its markup is not
// balanced: paragraphs are marked by empty <div type="x-p"/> milestones at
// each end, and a slice may open with the end of the paragraph before it.
// Every such milestone is read as "a paragraph starts here"; empty
// paragraphs fall away in the sanitizer.

const HI: Record<string, string> = {
  italic: "<i>",
  bold: "<b>",
  super: "<sup>",
  sub: "<sub>",
  "small-caps": '<span class="sc">',
};

const closing = (open: string) => `</${/^<(\w+)/.exec(open)![1]}>`;

export function osisToHtml(osis: string): string {
  const out: string[] = [];
  // What each open <hi> or <reference> was written as, so its end tag matches.
  const open: Record<string, string[]> = { hi: [], reference: [] };

  for (const token of tokenize(osis)) {
    if (token.type === "text") {
      out.push(escapeHtml(token.text));
    } else if (token.type === "open") {
      const { tag, attrs } = token;
      if (tag === "div" && attrs.type === "x-p") out.push("<p>");
      else if (tag === "lg") out.push("<p>");
      else if (tag === "title") out.push("<h4>");
      else if (tag === "hi" && !token.selfClosing) {
        const html = HI[attrs.type] ?? "<span>";
        open.hi.push(html);
        out.push(html);
      } else if (tag === "reference" && !token.selfClosing) {
        // Only a reference to one passage becomes a link.
        const range = parseOsisRange(attrs.osisref ?? attrs.osisRef ?? "");
        const html = range ? `<a data-verses="${versesAttribute(range)}">` : "<span>";
        open.reference.push(html);
        out.push(html);
      }
    } else if (token.tag === "title") out.push("</h4>");
    else if (token.tag === "lg") out.push("<p>");
    else if (token.tag === "l") out.push("<br>");
    else if (token.tag in open) {
      const html = open[token.tag].pop();
      if (html) out.push(closing(html));
    }
  }
  return sanitizeStudyHtml(out.join(""));
}
