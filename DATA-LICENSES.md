# Data licenses

Selah's code is MIT licensed ([LICENSE](LICENSE)).
The Bible texts, cross references, commentaries and study notes it imports are not covered by that license; each keeps its own terms, listed here.
Every one is public domain or openly licensed. Each row of the `translation` and `commentary_source` tables carries its license and attribution so the app can show them wherever the content appears.

The licenses below were read from each publisher's own page on 2026-10-12.

## Bible translations

| Translation | Publisher's page | License | Attribution |
| :--- | :--- | :--- | :--- |
| Berean Standard Bible (BSB) | <https://berean.bible/> | Public domain | Berean Standard Bible (BSB), public domain since April 30, 2023. berean.bible |
| World English Bible (WEB) | <https://ebible.org/Scriptures/details.php?id=engwebp> | Public domain | World English Bible (WEB), public domain. "World English Bible" is a trademark of eBible.org. |
| King James Version (KJV) | <https://ebible.org/Scriptures/details.php?id=eng-kjv2006> | Public domain; Crown patent in the United Kingdom | King James (Authorized) Version, 1769 text. Public domain outside the United Kingdom, where it is under Crown patent. |

### Berean Standard Bible

The publisher's licensing page, <https://berean.bible/licensing.htm>, says:

> The Berean Bible and Majority Bible texts are officially placed into the public domain as of April 30, 2023. […] Licensing is not required for any use.

No attribution is required; Selah credits the translation anyway.

The publisher's downloads page, <https://berean.bible/downloads.htm>, links the same text in USFM ("Berean Standard Bible - USFM", <https://bereanbible.com/bsb_usfm.zip>).
That file is the Berean Standard Bible text the statement above places in the public domain, and it marks the words of Jesus (USFM `\wj`), which the import reads from it.

### World English Bible

This is the edition without the Deuterocanon (eBible.org id `engwebp`).
Its page says:

> The World English Bible is in the Public Domain. That means that it is not copyrighted. However, "World English Bible" is a Trademark of eBible.org. […] All we ask is that if you CHANGE the actual text of the World English Bible in any way, you not call the result the World English Bible any more.

Selah does not change the words of the text.
See "What the import changes" below for the one place it changes a verse number.

The same page links the text in USFM (<https://ebible.org/Scriptures/engwebp_usfm.zip>).
The archive carries the same public-domain notice in its `copr.htm`, and it marks the WEB's prose paragraphs (USFM `\p`), which the import reads from it.

### King James Version

This is the 1769 standardized text without the Apocrypha (eBible.org id `eng-kjv2006`).
Its page says "Public Domain", and explains the one exception:

> Letters patent issued by King James with no expiration date means that to print this translation in the United Kingdom or import printed copies into the UK, you need permission. […] This royal decree has no effect outside of the UK, where this work is firmly in the Public Domain.

## Where the files come from

`pnpm import:bible` downloads all three translations from the [Free Use Bible API](https://bible.helloao.org/) by AO Lab, which republishes the publishers' texts as JSON with headings and footnotes:

| Translation | File |
| :--- | :--- |
| BSB | <https://bible.helloao.org/api/BSB/complete.json> |
| WEB | <https://bible.helloao.org/api/ENGWEBP/complete.json> |
| KJV | <https://bible.helloao.org/api/eng_kjv/complete.json> |

The API's code is MIT licensed (<https://github.com/HelloAOLab/bible-api>).
AO Lab adds no restrictions of its own to the texts: its site says each text keeps its own notice, and that the files may be cached, stored and downloaded without expiry.
The import reads only the Bible text, headings and footnotes from these files; it does not use the audio the API links to.

Each file is pinned by a checksum in `src/lib/bible/import/sources.ts`, and the import refuses a file whose text does not match.

### Formatting from the publishers' own files

The API's files leave out two things the publishers' files have, so the import also downloads one file from each of two publishers, for formatting only:

| Translation | File | Publisher's page | What is read from it |
| :--- | :--- | :--- | :--- |
| BSB | <https://bereanbible.com/bsb_usfm.zip> | <https://berean.bible/downloads.htm> | Which words are the words of Jesus (red-letter text) |
| WEB | <https://ebible.org/Scriptures/engwebp_usfm.zip> | <https://ebible.org/Scriptures/details.php?id=engwebp> | Where prose paragraphs start |

No words are taken from these files.
They are different builds of the same translations, and their wording differs from the API's in about a hundred verses each, so the import lays a mark onto a verse only when the two texts are the same character for character apart from spacing and line breaks.
A verse where they differ keeps the formatting it had, and the import prints every such verse.
With the files pinned today that is 23 of the 7,759 WEB verses where a paragraph starts, and one of the 2,047 BSB verses with words of Jesus.

For red-letter text the import allows two differences in punctuation, because neither leaves the place of a span in doubt; it prints these verses too:

- A closing quotation mark in square brackets (`[’’]`) at the end of the USFM verse, which the stored text does not have, is set aside (Matthew 5:48, 6:34, 19:30 and 24:51, John 13:38, 14:31 and 15:27, Revelation 1:20 and 2:29).
- A verse that differs in one stretch of punctuation is marked when every span starts and ends on a character outside that stretch: Mark 12:29 ("Hear O Israel" against "Hear, O Israel") and Luke 5:24 ("..." against "…").

The one BSB verse left without red-letter text is John 6:42, where the span ends on a closing quotation mark that the two files put on either side of the question mark.

745 of the WEB's paragraphs start in the middle of a verse, such as at a change of speaker. They are stored, and each changes the text by one character: see below.

Both files are pinned by a checksum in the same way, over the words and marks the import reads from them.
The KJV has no second file: its paragraph marks stop at Acts 20 in the printed text itself.

## What the import changes

The words of each translation are stored as published. The import changes only the following:

- Formatting is reduced to plain text, with a line break between lines. Paragraph and stanza breaks, and the marking of the words of Jesus, are stored beside the text as positions in it, where the sources have them. The indent of each line of poetry is not kept.
- KJV: the paragraph mark (¶) at the start of a verse is taken out of the text and stored as a paragraph break. Also removed is the chapter-and-verse prefix of each footnote ("3.3 for: or, about" becomes "for: or, about").
- WEB: where a paragraph starts in the middle of a verse, the space before it is stored as a line break, because a paragraph break inside a verse is stored as a position that follows a line break. This is 745 spaces in 682 verses. No word or punctuation mark changes: replacing every line break in the text with a space gives the text as it was.
- WEB: the closing doxology of Romans, which the WEB prints as Romans 14:24-26, is stored under Romans 16:25-27, where the KJV and BSB have it, so that one verse id means the same words in every translation. The WEB's footnotes there explain the two placements.
- WEB: four verses the WEB leaves empty except for a footnote (Luke 17:36, Acts 8:37, Acts 15:34 and Acts 24:7), and its empty Romans 16:25, are not stored as verses; each footnote is kept on the verse before.

## Cross references, commentary and study notes

`pnpm import:study` downloads these, and the study panel shows them beside a verse.
The licenses below were read from each publisher's own page or file on 2026-10-12.

| Content | Publisher's page | License | Attribution shown |
| :--- | :--- | :--- | :--- |
| Cross references | <https://www.openbible.info/labs/cross-references/> | CC BY 4.0 | Cross references from OpenBible.info |
| Matthew Henry, *Commentary on the Whole Bible* | <https://crosswire.org/sword/modules/ModInfo.jsp?modName=MHC> | Public domain | Matthew Henry, Commentary on the Whole Bible (1706–1721). Public domain. Text from the CrossWire Bible Society's SWORD module MHC, prepared from the Christian Classics Ethereal Library. |
| Jamieson, Fausset and Brown, *Commentary Critical and Explanatory on the Whole Bible* | <https://crosswire.org/sword/modules/ModInfo.jsp?modName=JFB> | Public domain | Robert Jamieson, A. R. Fausset and David Brown, Commentary Critical and Explanatory on the Whole Bible (1871). Public domain. Text from the CrossWire Bible Society's SWORD module JFB, prepared from the Christian Classics Ethereal Library. |
| Adam Clarke, *Commentary and Critical Notes on the Bible* | <https://crosswire.org/sword/modules/ModInfo.jsp?modName=Clarke> | Public domain | Adam Clarke, Commentary and Critical Notes on the Bible (1810–1826). Public domain. Text from the CrossWire Bible Society's SWORD module Clarke, prepared from Wikisource. |
| Tyndale Open Study Notes | <https://tyndaleopenresources.com/> | CC BY-SA 4.0 | Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com. © 2022 Tyndale House Publishers. Licensed CC BY-SA 4.0. |

Each download is pinned by a checksum in `src/lib/study/sources.ts`, over what the import reads from it, and the import refuses content that does not match.

### OpenBible.info cross references

The file is <https://a.openbible.info/data/cross-references.zip>, linked from the page above, which says:

> This data draws primarily from public-domain sources, especially the Treasury of Scripture Knowledge, which provides most of the data. […] Unless otherwise indicated, all content is licensed under a Creative Commons Attribution License.

The license link on that page is to [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and the file's own header line reads "www.openbible.info CC-BY".
The import stores every reference with its votes, mapped to canonical verse ids, and changes nothing else. The panel leaves out references voted below zero.
The page's Bible quotations are from the ESV and are not in the file; Selah quotes each reference from a translation it has loaded.

### The three commentaries

All three are long out of copyright. Selah takes them from the SWORD modules of the [CrossWire Bible Society](https://crosswire.org/), whose page for each (linked above) gives its "Distribution License" as "Public Domain", as does the `DistributionLicense` line of the `.conf` file inside each archive:

| Module | Version | File | The module's stated text source |
| :--- | :--- | :--- | :--- |
| MHC | 2.2 (2022-08-29) | <https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHC.zip> | Christian Classics Ethereal Library, ccel.org ("Public Domain--Copy Freely") |
| JFB | 3.0 (2021-02-15) | <https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/JFB.zip> | Christian Classics Ethereal Library, ccel.org |
| Clarke | 2.0 (2021-10-19) | <https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Clarke.zip> | Wikisource |

The product spec suggested the commentary JSON of the [Free Use Bible API](https://bible.helloao.org/).
Those files were checked on 2026-10-12 and not used: where a chapter is missing from them, the chapters after it are shifted onto the wrong numbers (its Jamieson-Fausset-Brown has the comment on Matthew 25 under Matthew 24 and none on Psalms 70 to 144; its Adam Clarke has no Psalms and Jeremiah's summaries under Isaiah), and they give only the first verse of a comment, not the verses it covers.
The CrossWire modules have every chapter and say which verses each comment is on.

What the import changes:

- The modules' OSIS markup is reduced to paragraphs, headings, italics, bold, superscripts and small capitals; a reference to a single passage becomes a link into the reader, and the words of any other reference stay as text.
- A comment is stored on the verses the module attaches it to. Three kinds of introduction are stored on the range they introduce instead of on the first verse they are printed before: a chapter's introduction on the chapter, a book's introduction on the book, and, in Clarke, the chapter summary that opens his note on each chapter's first verse.
- Matthew Henry prints the passage itself, in the King James Version, above each section of his commentary. That quotation is left out; his own words are not changed.

### Tyndale Open Study Notes

The file is <https://tyndaleopenresources.com/wp-content/themes/tyndale-openresources/files/tyndale_open-studynotes.zip>, the download on the publisher's page, which says "This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License".
The `_README.txt` inside the archive says:

> Tyndale Open Study Notes. Copyright (C) 2022 by Tyndale House Publishers. […] Under the terms of the CC BY-SA license, you may copy and redistribute this unmodified work as long as you provide clear attribution of the copyright held by Tyndale House Publishers. If you modify a copy or translate this work, thereby creating a derivative work, you must indicate what changes you have made and attribute the work as follows: "Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com."

Selah uses that wording, because the import changes the following:

- Only the verse-by-verse study notes (`StudyNotes.xml`, release 1.25) are imported. The book introductions, profiles and theme articles in the same archive are not.
- The notes' markup is reduced to paragraphs, italics, bold, small capitals and superscripts. Their links to Bible passages become links into the reader; their links to the profiles and theme articles, which are not imported, keep their words and lose the link.
- Notes on the same passage are stored together, in the file's order.

The words of the notes are not changed.

What share-alike covers: the notes as Selah stores and shows them are an adaptation of Tyndale's work, and are themselves offered under CC BY-SA 4.0. That includes the rows of `commentary_entry` for this source and the excerpt in the test fixture.
Selah's code stays MIT: it reads and displays the notes and contains none of them.
A writer's own reflections are their own. One that quotes a study note at length should credit it as above; one that reworks the notes into something new would be an adaptation, and CC BY-SA 4.0 would apply to it.

## Selah's mirror of these files

The publishers' addresses are not versioned, so Selah keeps a copy of every file named above, exactly as it was downloaded, as an asset of a GitHub release of this repository used only for data: <https://github.com/mattsanchez/selah/releases/tag/data-v1>.
The imports download from there first and from the publisher second, and check either copy against the same pinned checksum.
The README's [Data releases](README.md#data-releases) section says how a release is made.

Each file is redistributed unmodified, under the terms above, which were read again on 2026-10-13 before the first release was published:

| File | From | Terms it is mirrored under |
| :--- | :--- | :--- |
| BSB, WEB and KJV as JSON (three files) | Free Use Bible API, `bible.helloao.org` | The texts are public domain. AO Lab's site says it "adds no restrictions; each text keeps its own notice" and allows the files to be cached, stored and downloaded without expiry. |
| BSB in USFM | `bereanbible.com` | Public domain: "Licensing is not required for any use." |
| WEB in USFM | `ebible.org` | Public domain; the `copr.htm` inside the archive says "You may copy, publish, […] distribute, redistribute […] the World English Bible as much as you want". |
| Cross references | `a.openbible.info` | CC BY 4.0, which allows redistribution with attribution. The attribution, "Cross references from OpenBible.info", is in the release's notices. |
| MHC, JFB and Clarke SWORD modules (three files) | `crosswire.org` | The commentaries are public domain, and CrossWire's own configuration file in each package gives `DistributionLicense=Public Domain` (MHC's adds "Public Domain--Copy Freely"). CrossWire's wiki defines that field as the module's distribution license; its copyright page and module pages put no condition on redistributing public-domain modules. |
| Tyndale Open Study Notes | `tyndaleopenresources.com` | CC BY-SA 4.0. The archive's `_README.txt` says "you may copy and redistribute this unmodified work as long as you provide clear attribution of the copyright held by Tyndale House Publishers". The archive is mirrored whole and unmodified, with that notice. |

The release carries a `NOTICES.md` with each file's license notice and attribution, and a `MANIFEST.json` with each file's upstream address, download date, size and checksums.
Nothing else is in it: no code, and nothing that is not public domain or openly licensed.

## In this repository

The only Bible text committed to git is the test fixture in `src/db/seed/fixtures/bible/`: Psalms, John and Romans from each of the three translations above, as produced by the import.
The BSB's red-letter marking and the WEB's paragraphs in it come from the two USFM files above; no text from those files is committed.

The only study data committed is the fixture in `src/db/seed/fixtures/study/`, about 240 KB, as produced by the import: the cross references from the verses of Psalm 23, John 3:16-21 and Romans 8:28-30, and the commentary and study notes on those verses.
`tyndale.json` there is an excerpt of Tyndale Open Study Notes (18 notes), adapted as described above and licensed CC BY-SA 4.0, not MIT. `cross-references.json` is from OpenBible.info, CC BY 4.0. The other three files are public domain.

Full datasets are downloaded by `pnpm import:bible` and `pnpm import:study` into `.cache/`, which git ignores.
The mirrored files are release assets, not part of the git history.
