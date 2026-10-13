// One row of `cross_ref`: a reference from a verse to a verse or range.
export type CrossRef = { fromVerse: number; toStart: number; toEnd: number; votes: number };

// One row of `commentary_entry`, before it is tied to a source. `html` is
// already sanitized (see ./html.ts).
export type CommentaryRecord = { verseStart: number; verseEnd: number; html: string };
