// The pinned Bible sources. Each is one file from the Free Use Bible API
// (bible.helloao.org), which republishes the publishers' texts as JSON with
// headings and footnotes. Two translations also have a formatting source, for
// markup that file lacks: see FormattingSource. The API serves only the current build of a file, so
// a pin is a checksum of the text we reviewed (see contentSha256 in
// ./download.ts): when upstream changes the text, the import stops until the
// new file has been checked and the pin updated here, and the fixture rebuilt
// with `pnpm fixture:bible`. The formatting sources are pinned the same way.
// DATA-LICENSES.md documents the license of each text.

// What a second source supplies: where prose paragraphs start, or which words
// are the words of Jesus (red-letter text).
export type FormattingKind = "paragraphs" | "wordsOfJesus";

// A second pinned file for a translation, in USFM from its publisher, read
// only for formatting the main source lacks. No words are taken from it: its
// marks are laid onto the verses of the main source where the two texts agree
// (see ./formatting.ts). `contentSha256` is formattingSha256 in ./download.ts.
export type FormattingSource = {
  kind: FormattingKind;
  // The publisher's page that links to the file.
  sourceUrl: string;
  downloadUrl: string;
  contentSha256: string;
  // Set for a file that is left out of Selah's mirror (./mirror.ts), which is
  // then downloaded from the publisher only.
  upstreamOnly?: boolean;
};

export type BibleSource = {
  // Row in `translation`.
  id: string;
  name: string;
  abbrev: string;
  license: string;
  attribution: string;
  // The publisher's page for the text.
  sourceUrl: string;
  // Where the import downloads it from, and what it must hash to.
  downloadUrl: string;
  contentSha256: string;
  // As in FormattingSource.
  upstreamOnly?: boolean;
  stripFootnoteOrigin?: boolean;
  pilcrowParagraphs?: boolean;
  formatting?: FormattingSource;
};

export const BIBLE_SOURCES: readonly BibleSource[] = [
  {
    id: "bsb",
    name: "Berean Standard Bible",
    abbrev: "BSB",
    license: "Public domain",
    attribution:
      "Berean Standard Bible (BSB), public domain since April 30, 2023. berean.bible",
    sourceUrl: "https://berean.bible/",
    downloadUrl: "https://bible.helloao.org/api/BSB/complete.json",
    contentSha256: "c3db8113131e2a5e659d152350d056f1f968cf4b297970a1bc0b924949e76a9e",
    // The API's BSB has no red-letter markup; the publisher's USFM has.
    formatting: {
      kind: "wordsOfJesus",
      sourceUrl: "https://berean.bible/downloads.htm",
      downloadUrl: "https://bereanbible.com/bsb_usfm.zip",
      contentSha256: "931cb4ea1ff14f28edd5fc5c46443370d34fbd0f74a3cf489b2d380a1b72f100",
    },
  },
  {
    id: "web",
    name: "World English Bible",
    abbrev: "WEB",
    license: "Public domain",
    attribution:
      "World English Bible (WEB), public domain. “World English Bible” is a trademark of eBible.org.",
    sourceUrl: "https://ebible.org/Scriptures/details.php?id=engwebp",
    downloadUrl: "https://bible.helloao.org/api/ENGWEBP/complete.json",
    contentSha256: "8c59a5801883a248eed6b1660af984a5617a2280644743b77a5e3baca2789720",
    // The API's WEB had the stanzas of its poetry but not its prose
    // paragraphs until its November 2026 build; the publisher's USFM has
    // them, and fills any the API's file lacks.
    formatting: {
      kind: "paragraphs",
      sourceUrl: "https://ebible.org/Scriptures/details.php?id=engwebp",
      downloadUrl: "https://ebible.org/Scriptures/engwebp_usfm.zip",
      contentSha256: "792fcf780a9914ef4899f260ab3f0bfda30334944a32be8bbcfa462d7110a3f1",
    },
  },
  {
    id: "kjv",
    name: "King James Version",
    abbrev: "KJV",
    license: "Public domain (Crown patent in the United Kingdom)",
    attribution:
      "King James (Authorized) Version, 1769 text. Public domain outside the United Kingdom, where it is under Crown patent.",
    sourceUrl: "https://ebible.org/Scriptures/details.php?id=eng-kjv2006",
    downloadUrl: "https://bible.helloao.org/api/eng_kjv/complete.json",
    contentSha256: "35ba3fba766c59bc326c0c6bb610f6edc6b89f3b78a14f0928e66c0403dd204e",
    stripFootnoteOrigin: true,
    pilcrowParagraphs: true,
  },
];

// The default translation is the first source.
export const DEFAULT_TRANSLATION_ID = BIBLE_SOURCES[0].id;

// The books of the committed test fixture.
export const FIXTURE_BOOKS = ["PSA", "JHN", "ROM"] as const;
