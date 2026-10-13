import type { VerseRange } from "@/lib/bible/verse-id";

// The pinned study sources: cross references, commentaries and study notes.
// Like the Bible sources (src/lib/bible/import/sources.ts), each is one
// download pinned by a checksum of what the import reads from it (see
// ./import/download.ts), so the import stops when upstream changes the
// content until the new file has been reviewed and the pin updated here, and
// the fixture rebuilt with `pnpm fixture:study`. DATA-LICENSES.md documents
// each license.

export type StudyDownload = {
  // Names the file in the download cache.
  id: string;
  name: string;
  license: string;
  // Shown wherever the content appears.
  attribution: string;
  // The publisher's page.
  sourceUrl: string;
  downloadUrl: string;
  contentSha256: string;
};

// OpenBible.info's cross references. They have no table of their own for
// their license: every row of `cross_ref` is theirs.
export const CROSS_REFERENCES: StudyDownload = {
  id: "cross-references",
  name: "OpenBible.info cross references",
  license: "CC BY 4.0",
  attribution: "Cross references from OpenBible.info",
  sourceUrl: "https://www.openbible.info/labs/cross-references/",
  downloadUrl: "https://a.openbible.info/data/cross-references.zip",
  contentSha256: "17bebf01fd66590525d6f60f9de04ec9c5235d8272ebc247d078a38940003a64",
};

export type CommentarySource = StudyDownload & {
  // Row in `commentary_source`.
  kind: "commentary" | "study_notes";
  position: number;
} & (
    | {
        // A SWORD module from the CrossWire Bible Society.
        format: "sword";
        // See SwordOptions in ./import/sword.ts.
        firstVerseStarts?: RegExp;
        omitQuotedPassage?: boolean;
      }
    | {
        // The publisher's archive of Tyndale Open Study Notes.
        format: "tyndale";
      }
  );

const swordModule = (name: string) => ({
  sourceUrl: `https://crosswire.org/sword/modules/ModInfo.jsp?modName=${name}`,
  downloadUrl: `https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/${name}.zip`,
});

export const COMMENTARY_SOURCES: CommentarySource[] = [
  {
    id: "matthew-henry",
    name: "Matthew Henry’s Commentary on the Whole Bible",
    kind: "commentary",
    position: 1,
    license: "Public domain",
    attribution:
      "Matthew Henry, Commentary on the Whole Bible (1706–1721). Public domain. " +
      "Text from the CrossWire Bible Society’s SWORD module MHC, prepared from the Christian Classics Ethereal Library.",
    ...swordModule("MHC"),
    contentSha256: "ac937614662165cec6c31a8449592fd5faf00d3e837eceea33199feca0cbe4d0",
    format: "sword",
    omitQuotedPassage: true,
  },
  {
    id: "jamieson-fausset-brown",
    name: "Jamieson, Fausset and Brown’s Commentary",
    kind: "commentary",
    position: 2,
    license: "Public domain",
    attribution:
      "Robert Jamieson, A. R. Fausset and David Brown, Commentary Critical and Explanatory on the Whole Bible (1871). Public domain. " +
      "Text from the CrossWire Bible Society’s SWORD module JFB, prepared from the Christian Classics Ethereal Library.",
    ...swordModule("JFB"),
    contentSha256: "949b6d41cd1bcfa8434af2b41e1d6024fda39ddc187fa662150f9817d13e4d72",
    format: "sword",
  },
  {
    id: "adam-clarke",
    name: "Adam Clarke’s Commentary",
    kind: "commentary",
    position: 3,
    license: "Public domain",
    attribution:
      "Adam Clarke, Commentary and Critical Notes on the Bible (1810–1826). Public domain. " +
      "Text from the CrossWire Bible Society’s SWORD module Clarke, prepared from Wikisource.",
    ...swordModule("Clarke"),
    contentSha256: "a9c17be3f5e5a0c25b1d6e50238aa05c3310cfe49983596e2eeb2ad88d4fde32",
    format: "sword",
    // Clarke's entry for a chapter's first verse opens with his summary of
    // the chapter (and, in chapter 1, his preface to the book).
    firstVerseStarts: /<hi type="bold">Verse \d+/,
  },
  {
    id: "tyndale",
    name: "Tyndale Open Study Notes",
    kind: "study_notes",
    position: 4,
    license: "CC BY-SA 4.0",
    // The wording the publisher's README asks for where the work is adapted.
    attribution:
      "Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers " +
      "is available for free at http://www.tyndaleopenresources.com. © 2022 Tyndale House Publishers. " +
      "Licensed CC BY-SA 4.0.",
    sourceUrl: "https://tyndaleopenresources.com/",
    downloadUrl:
      "https://tyndaleopenresources.com/wp-content/themes/tyndale-openresources/files/tyndale_open-studynotes.zip",
    contentSha256: "0a1fc04a840b14939a83bc2e4086b23f0cb7643c035ea256ba9dbf4144e4226c",
    format: "tyndale",
  },
];

// The passages the committed test fixture covers: the cross references from
// their verses, and the commentary and notes on them. A few short passages in
// the fixture's books; the whole of each source is megabytes.
export const FIXTURE_PASSAGES: VerseRange[] = [
  { start: 19023001, end: 19023006 }, // Psalm 23
  { start: 43003016, end: 43003021 }, // John 3:16-21
  { start: 45008028, end: 45008030 }, // Romans 8:28-30
];
