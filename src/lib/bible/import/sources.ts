// The pinned Bible sources. Each is one file from the Free Use Bible API
// (bible.helloao.org), which republishes the publishers' texts as JSON with
// headings and footnotes. The API serves only the current build of a file, so
// a pin is a checksum of the text we reviewed (see contentSha256 in
// ./download.ts): when upstream changes the text, the import stops until the
// new file has been checked and the pin updated here, and the fixture rebuilt
// with `pnpm fixture:bible`.
// DATA-LICENSES.md documents the license of each text.
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
  stripFootnoteOrigin?: boolean;
  stripParagraphMarks?: boolean;
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
    contentSha256: "a997d84c4cdcb3a8a450c45a88f8d4690d2d77b2d2902926cb6faa8f7c8a5c4c",
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
    contentSha256: "503b9b9bb9d4e98c63cbf1eb9bb67b5f7d507978bb0de866a00e46b7337a8395",
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
    contentSha256: "bd95ed6510371f7fb59fd4b6beeae5804730344fef4e2307912a8bba3d73bf32",
    stripFootnoteOrigin: true,
    stripParagraphMarks: true,
  },
];

// The default translation is the first source.
export const DEFAULT_TRANSLATION_ID = BIBLE_SOURCES[0].id;

// The books of the committed test fixture.
export const FIXTURE_BOOKS = ["PSA", "JHN", "ROM"] as const;
