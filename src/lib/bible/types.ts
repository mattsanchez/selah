// The structured JSON stored in the `headings`, `footnotes`, `breaks` and
// `words_of_jesus` columns of `verse`. Every offset is an index into the text
// it belongs to, in UTF-16 code units, as String.prototype.slice counts.

// A note anchored in a text. `offset` is where the note's marker goes: 0 is
// before the first character, text.length is after the last.
export type Footnote = { offset: number; text: string };

// Text printed with a verse but not part of it.
// - "section": an editorial heading printed before the verse.
// - "superscription": a psalm title ("A Psalm of David."), part of the
//   Hebrew text but unnumbered in English Bibles; printed before verse 1.
// - "subscription": a closing note printed after the verse, such as the
//   KJV's "Written to the Romans from Corinthus".
export type Heading = {
  kind: "section" | "superscription" | "subscription";
  text: string;
  // Notes anchored in the heading's own text.
  footnotes?: Footnote[];
};

// Where a verse's text starts a new block, as the translation lays it out.
// - "paragraph": a new paragraph, or a new stanza of poetry, starts at
//   `offset`. At 0 the verse opens the paragraph; a larger offset is a break
//   inside the verse and always follows a "\n" in the text.
// - "line": the verse starts on a new line of the same paragraph or stanza,
//   as each line of poetry does. Only ever at offset 0; line breaks inside a
//   verse are the "\n" characters of its text.
// A verse with no break at offset 0 runs on from the verse before it. The
// first verse of a chapter and a verse with headings start a new block
// whether or not the source marks one.
export type Break = { offset: number; kind: "paragraph" | "line" };

// A stretch of a verse's text, from `start` up to but not including `end`.
export type Span = { start: number; end: number };

// One row of `verse`, before it is tied to a translation. Lines within `text`
// are separated by "\n"; a verse of running prose has one only where a
// paragraph starts inside it.
export type VerseRecord = {
  verseId: number;
  text: string;
  headings: Heading[];
  footnotes: Footnote[];
  breaks: Break[];
  // The words of Jesus (red-letter text), where the translation marks them.
  wordsOfJesus: Span[];
};
