import type { Span } from "../types";

// A reader for the USFM files the publishers post (ebible.org for the WEB,
// berean.bible for the BSB). The import takes no words from these files: it
// reads them only for the formatting the main source lacks, so the reader
// keeps just the text of each verse, where prose paragraphs start in it and
// which of it is marked as the words of Jesus.

export type UsfmVerse = {
  chapter: number;
  verse: number;
  // The words of the verse with markup, notes and headings taken out and
  // whitespace collapsed. Used only to line the marks up with the stored text.
  text: string;
  // Offsets in `text` where a prose paragraph (\p, \pi) starts; 0 means the
  // verse opens the paragraph.
  paragraphs: number[];
  // The stretches of `text` inside \wj ... \wj*.
  wordsOfJesus: Span[];
};

export type UsfmBook = { id: string; verses: UsfmVerse[] };

// Markers that start a block of the running text. Only \p and \pi start a
// prose paragraph in the sense of `Break`; the rest are poetry lines, list
// items, continuations (\m, \nb) and blank lines.
const TEXT_BLOCKS = new Set([
  "p", "pi", "m", "mi", "nb", "pc", "pm", "pmo", "pmc", "pmr", "po", "cls",
  "q", "qr", "qc", "qm", "b", "li", "lh", "lf", "lim",
]);
const PROSE_PARAGRAPHS = new Set(["p", "pi"]);

// Markers that start a block which is not verse text: identification, titles,
// introductions, headings, psalm superscriptions (\d), acrostic letters (\qa)
// and speaker labels (\sp). The import has headings from the main source.
const OTHER_BLOCKS = new Set([
  "id", "ide", "usfm", "sts", "rem", "h", "toc", "toca", "mt", "mte", "cl", "cp", "cd",
  "imt", "is", "ip", "ipi", "im", "imi", "ipq", "imq", "ipr", "iq", "ib", "ili", "iot", "io", "iex", "imte", "ie",
  "ms", "mr", "s", "sr", "r", "d", "sp", "sd", "qa",
]);

// Character markers whose text stays in the verse.
const INLINE = new Set([
  "w", "wj", "qs", "wh", "wg", "wa", "add", "nd", "pn", "bk", "k", "tl", "qt",
  "it", "bd", "bdit", "em", "sc", "no", "sls", "ord", "sig", "png", "ref",
]);
// Notes and cross references: everything up to the closing marker is dropped.
const NOTES = new Set(["f", "fe", "ef", "x", "ex"]);
// A word with attributes: `\w text|strong="G1722"\w*`.
const WITH_ATTRIBUTES = new Set(["w", "ref"]);

const TOKEN = /\\(\+?)([a-z]+)(\d*)(\*?)|[^\\]+/g;

// Parses one book. Throws on markup it does not know, rather than guess what
// a marker does to the text.
export function parseUsfmBook(usfm: string): UsfmBook {
  let id: string | undefined;
  const verses: UsfmVerse[] = [];
  let chapter: number | undefined;
  let current: UsfmVerse | undefined;
  // What the next piece of plain text is: verse text, a block that is not
  // verse text, the inside of a note, the number after \c or \v, or the book
  // code after \id.
  let inText = false;
  let note: string | undefined;
  let expect: "id" | "chapter" | "verse" | undefined;
  let attributes = false;
  let paragraphPending = false;
  let wordsOfJesus = false;
  // Whether a space separates what was last added from what comes next.
  let space = false;
  let afterMarker = false;

  const append = (raw: string) => {
    if (/^\s/.test(raw)) space = true;
    const piece = raw.replace(/\s+/g, " ").trim();
    if (piece !== "") {
      if (!current) throw new Error(`${id}: text before the first verse: "${piece}"`);
      if (space && current.text !== "") current.text += " ";
      if (paragraphPending) current.paragraphs.push(current.text.length);
      paragraphPending = false;

      const start = current.text.length;
      current.text += piece;
      if (wordsOfJesus) {
        const open = current.wordsOfJesus.at(-1);
        // Adjoining marked pieces are one span, as are pieces a note or a
        // new line falls between.
        if (open && current.text.slice(open.end, start).trim() === "") {
          open.end = current.text.length;
        } else {
          current.wordsOfJesus.push({ start, end: current.text.length });
        }
      }
    }
    space = /\s$/.test(raw);
  };

  const tokens = usfm.replace(/^\uFEFF/, "").matchAll(TOKEN);
  for (const [token, nested, name, , closing] of tokens) {
    if (name === undefined) {
      if (note) continue;
      if (expect === "id") {
        id = token.trim().split(/\s+/)[0];
        expect = undefined;
        continue;
      }
      // One space after a marker only ends the marker. An attribute list
      // runs from "|" to the closing marker.
      let text = afterMarker ? token.replace(/^\s/, "") : token;
      afterMarker = false;
      if (attributes) text = text.split("|")[0];
      if (expect) {
        const number = /^\s*(\d+)(?=\s|$)/.exec(text);
        if (!number) {
          const marker = expect === "chapter" ? "c" : "v";
          throw new Error(
            `${id}: \\${marker} without a plain number: "${text.trim().slice(0, 20)}"`,
          );
        }
        text = text.slice(number[0].length);
        if (expect === "chapter") {
          chapter = Number(number[1]);
          current = undefined;
        } else {
          if (chapter === undefined) throw new Error(`${id}: verse before the first chapter`);
          current = {
            chapter,
            verse: Number(number[1]),
            text: "",
            paragraphs: [],
            wordsOfJesus: [],
          };
          verses.push(current);
          space = false;
        }
        expect = undefined;
        // The rest of a \c line is not text.
        if (!current) continue;
      }
      if (inText) append(text);
      continue;
    }

    afterMarker = !closing;
    if (note) {
      if (closing && name === note) note = undefined;
      continue;
    }
    if (closing) {
      if (name === "wj") wordsOfJesus = false;
      else if (!INLINE.has(name)) throw new Error(`${id}: unknown marker \\${name}*`);
      if (WITH_ATTRIBUTES.has(name)) attributes = false;
    } else if (name === "c" || name === "v") {
      expect = name === "c" ? "chapter" : "verse";
      if (name === "c") inText = false;
    } else if (NOTES.has(name)) {
      note = name;
    } else if (name === "wj") {
      wordsOfJesus = true;
    } else if (INLINE.has(name)) {
      attributes = WITH_ATTRIBUTES.has(name);
    } else if (!nested && TEXT_BLOCKS.has(name)) {
      inText = true;
      paragraphPending = PROSE_PARAGRAPHS.has(name);
      space = true;
    } else if (!nested && OTHER_BLOCKS.has(name)) {
      inText = false;
      paragraphPending = false;
      if (name === "id") expect = "id";
    } else {
      throw new Error(`${id}: unknown marker \\${name}`);
    }
  }

  if (!id) throw new Error("USFM file has no \\id line");
  return { id, verses };
}
