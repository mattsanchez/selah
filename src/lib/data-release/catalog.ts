import { formattingFile, sourceFile, type PinnedFile } from "@/lib/bible/import/download";
import { BIBLE_SOURCES } from "@/lib/bible/import/sources";
import { commentaryFile, crossReferencesFile } from "@/lib/study/import/download";
import { COMMENTARY_SOURCES, CROSS_REFERENCES } from "@/lib/study/sources";

// Every pinned source file, with what a data release says about it: where it
// came from, its license and the notice that travels with it. This is the one
// list of everything the imports download; `pnpm data:release` mirrors the
// files in it (see ./build.ts), and anything that checks upstream can walk it.

export type CatalogEntry = {
  // The source's id, with "-formatting" for a translation's second file.
  id: string;
  title: string;
  // What kind of file it is.
  format: "helloao-json" | "usfm-zip" | "openbible-zip" | "sword-zip" | "tyndale-zip";
  // Name, upstream URL, pin and how to verify it.
  file: PinnedFile<unknown>;
  // The function that computes the pin, for the manifest.
  pinnedBy: string;
  // The publisher's page.
  sourcePage: string;
  license: string;
  attribution: string;
  // The license notice published beside the file, as Markdown.
  notice: string;
};

const BIBLE_DOWNLOAD = "src/lib/bible/import/download.ts";
const STUDY_DOWNLOAD = "src/lib/study/import/download.ts";

const TRANSLATION_NOTICES: Record<string, string> = {
  bsb:
    "The Berean Standard Bible is in the public domain. Its publisher's licensing page, " +
    "<https://berean.bible/licensing.htm>, says:\n\n" +
    "> The Berean Bible and Majority Bible texts are officially placed into the public domain as of April 30, 2023. […] " +
    "Licensing is not required for any use.",
  web:
    "The World English Bible is in the public domain. Its publisher's page, " +
    "<https://ebible.org/Scriptures/details.php?id=engwebp>, says:\n\n" +
    "> The World English Bible is in the Public Domain. That means that it is not copyrighted. " +
    "However, \"World English Bible\" is a Trademark of eBible.org. […] All we ask is that if you CHANGE the actual text " +
    "of the World English Bible in any way, you not call the result the World English Bible any more.",
  kjv:
    "The King James (Authorized) Version, 1769 text, is in the public domain outside the United Kingdom. " +
    "Its page at eBible.org, <https://ebible.org/Scriptures/details.php?id=eng-kjv2006>, says \"Public Domain\" and:\n\n" +
    "> Letters patent issued by King James with no expiration date means that to print this translation in the " +
    "United Kingdom or import printed copies into the UK, you need permission. […] This royal decree has no effect " +
    "outside of the UK, where this work is firmly in the Public Domain.",
};

const HELLOAO_NOTICE =
  "This file is the text as republished in JSON, with headings and footnotes, by the Free Use Bible API " +
  "(<https://bible.helloao.org/>, AO Lab), unmodified. AO Lab adds no restrictions of its own: its site says each " +
  "text keeps its own notice and that the files may be cached, stored and downloaded without expiry.";

const USFM_NOTICE = "This file is the publisher's own USFM archive of the same text, unmodified.";

const swordNotice = (module: string, conf: string, about: string) =>
  `This file is the SWORD module ${module} as packaged by the CrossWire Bible Society ` +
  `(<https://crosswire.org/sword/modules/ModInfo.jsp?modName=${module}>), unmodified. ` +
  `The commentary is in the public domain, and the module's configuration file inside the archive, \`${conf}\`, ` +
  `gives its distribution license as:\n\n> DistributionLicense=Public Domain\n\n${about}`;

const STUDY_NOTICES: Record<string, string> = {
  "cross-references":
    "Cross references from OpenBible.info, licensed under the Creative Commons Attribution 4.0 International License " +
    "(CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>). The publisher's page, " +
    "<https://www.openbible.info/labs/cross-references/>, says:\n\n" +
    "> This data draws primarily from public-domain sources, especially the Treasury of Scripture Knowledge, which " +
    "provides most of the data. […] Unless otherwise indicated, all content is licensed under a Creative Commons " +
    "Attribution License.\n\n" +
    "The file is the publisher's archive, unmodified; its header line reads \"www.openbible.info CC-BY\" with the date " +
    "it was built. OpenBible.info rebuilds the archive daily with its readers' latest votes, so this copy holds the " +
    "votes as they stood on that date.",
  "matthew-henry": swordNotice(
    "MHC",
    "mods.d/mhc.conf",
    "The same file says: \"Public Domain--Copy Freely. This text was prepared from the Christian Classics Ethereal " +
      "Library located at www.ccel.org.\"",
  ),
  "jamieson-fausset-brown": swordNotice(
    "JFB",
    "mods.d/jfb.conf",
    "The same file names the Christian Classics Ethereal Library (ccel.org) as the source of the text.",
  ),
  "adam-clarke": swordNotice(
    "Clarke",
    "mods.d/clarke.conf",
    "The same file names Wikisource as the source of the text.",
  ),
  tyndale:
    "Tyndale Open Study Notes. Copyright © 2022 by Tyndale House Publishers. Licensed under the Creative Commons " +
    "Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0, <http://creativecommons.org/licenses/by-sa/4.0/>). " +
    "The original work is available for free at <http://www.tyndaleopenresources.com>.\n\n" +
    "This file is the publisher's archive, unmodified, redistributed under those terms. Its `_README.txt` says:\n\n" +
    "> Under the terms of the CC BY-SA license, you may copy and redistribute this unmodified work as long as you " +
    "provide clear attribution of the copyright held by Tyndale House Publishers. If you modify a copy or translate " +
    "this work, thereby creating a derivative work, you must indicate what changes you have made and attribute the " +
    "work as follows: “Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is " +
    "available for free at http://www.tyndaleopenresources.com.”",
};

function notice(notices: Record<string, string>, id: string, ...more: string[]): string {
  const text = notices[id];
  // A source with no notice written for it must not be published without one.
  if (!text) throw new Error(`No license notice is written for "${id}" in src/lib/data-release/catalog.ts`);
  return [text, ...more].join("\n\n");
}

// Every pinned file, in the order first boot loads them.
export function pinnedFiles(): CatalogEntry[] {
  const bible = BIBLE_SOURCES.flatMap((source): CatalogEntry[] => {
    const { formatting } = source;
    const shared = { license: source.license, attribution: source.attribution };
    return [
      {
        id: source.id,
        title: `${source.name} (${source.abbrev}): text, headings and footnotes`,
        format: "helloao-json",
        file: sourceFile(source) as PinnedFile<unknown>,
        pinnedBy: `contentSha256 in ${BIBLE_DOWNLOAD}`,
        sourcePage: source.sourceUrl,
        ...shared,
        notice: notice(TRANSLATION_NOTICES, source.id, HELLOAO_NOTICE),
      },
      ...(formatting
        ? [
            {
              id: `${source.id}-formatting`,
              title:
                `${source.name} (${source.abbrev}): the publisher's USFM, read for ` +
                (formatting.kind === "paragraphs" ? "paragraph breaks" : "red-letter text"),
              format: "usfm-zip" as const,
              file: formattingFile({ ...source, formatting }) as PinnedFile<unknown>,
              pinnedBy: `formattingSha256 in ${BIBLE_DOWNLOAD}`,
              sourcePage: formatting.sourceUrl,
              ...shared,
              notice: notice(TRANSLATION_NOTICES, source.id, USFM_NOTICE),
            },
          ]
        : []),
    ];
  });

  const study = [
    {
      source: CROSS_REFERENCES,
      format: "openbible-zip" as const,
      file: crossReferencesFile(CROSS_REFERENCES) as PinnedFile<unknown>,
      pinnedBy: `crossReferencesSha256 in ${STUDY_DOWNLOAD}`,
    },
    ...COMMENTARY_SOURCES.map((source) => ({
      source,
      format: source.format === "sword" ? ("sword-zip" as const) : ("tyndale-zip" as const),
      file: commentaryFile(source),
      pinnedBy: `${source.format === "sword" ? "swordSha256" : "tyndaleSha256"} in ${STUDY_DOWNLOAD}`,
    })),
  ].map(
    ({ source, format, file, pinnedBy }): CatalogEntry => ({
      id: source.id,
      title: source.name,
      format,
      file,
      pinnedBy,
      sourcePage: source.sourceUrl,
      license: source.license,
      // The archive itself is not adapted, whatever the import does with it.
      attribution: source.attribution.replace(/^Adapted from /, ""),
      notice: notice(STUDY_NOTICES, source.id),
    }),
  );

  return [...bible, ...study];
}
