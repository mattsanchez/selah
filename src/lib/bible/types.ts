// The structured JSON stored in `verse.headings` and `verse.footnotes`.

// A note anchored in a text. `offset` is the index into that text (in UTF-16
// code units, as String.prototype.slice counts) where the note's marker goes:
// 0 is before the first character, text.length is after the last.
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

// One row of `verse`, before it is tied to a translation. Lines of poetry
// within `text` are separated by "\n"; prose verses have none.
export type VerseRecord = {
  verseId: number;
  text: string;
  headings: Heading[];
  footnotes: Footnote[];
};
