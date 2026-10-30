import { COMMENTARY_SOURCES } from "@/lib/study/sources";

// The commentaries and notes Ask may read, with who wrote them and the
// tradition they write from. Retrieval reads exactly the sources listed here,
// so adding one is one line. Pure data: the browser uses it too.
//
// The license, attribution and address of each come from `commentary_source`;
// what is here is what that table has no column for. `credit` is the short
// form of the attribution for sources whose license asks for one, and must
// name the holder the publisher names (DATA-LICENSES.md quotes it).

export type AskSource = {
  // Who the answer says is speaking.
  author: string;
  work?: string;
  // Named wherever the source is quoted, so that a reading is never taken for
  // what the text says or for Selah's own view.
  tradition: string;
  // Set for a source under a license that travels with its words (share-alike).
  // Such a source is quoted, never rewritten, and every quote carries `credit`
  // and a link to the license.
  shareAlike?: { credit: string; licenseUrl: string };
};

export const ASK_SOURCES: Record<string, AskSource> = {
  "matthew-henry": { author: "Matthew Henry", work: "Commentary on the Whole Bible", tradition: "English Puritan" },
  "jamieson-fausset-brown": {
    author: "Jamieson, Fausset and Brown",
    work: "Commentary Critical and Explanatory on the Whole Bible",
    tradition: "Protestant evangelical",
  },
  "adam-clarke": {
    author: "Adam Clarke",
    work: "Commentary and Critical Notes on the Bible",
    tradition: "Wesleyan Methodist",
  },
  tyndale: {
    author: "Tyndale Open Study Notes",
    tradition: "Protestant evangelical",
    shareAlike: {
      credit: "© 2022 Tyndale House Publishers",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
};

// "Matthew Henry (English Puritan tradition)".
export const sourceLabel = ({ author, tradition }: AskSource) => `${author} (${tradition} tradition)`;

// What a quote from a share-alike source says about itself.
export type ShareAlikeSource = {
  id: string;
  name: string;
  credit: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
};

export const SHARE_ALIKE_SOURCES: ShareAlikeSource[] = Object.entries(ASK_SOURCES).flatMap(([id, source]) => {
  const stored = COMMENTARY_SOURCES.find((each) => each.id === id);
  return source.shareAlike && stored
    ? [{ id, name: stored.name, license: stored.license, sourceUrl: stored.sourceUrl, ...source.shareAlike }]
    : [];
});
