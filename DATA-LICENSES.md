# Data licenses

Selah's code is MIT licensed ([LICENSE](LICENSE)).
The Bible texts it imports are not covered by that license; each keeps its own terms, listed here.
Every text is public domain or openly licensed, and each row of the `translation` table carries its license and attribution so the app can show them wherever the text appears.

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

## In this repository

The only Bible text committed to git is the test fixture in `src/db/seed/fixtures/bible/`: Psalms, John and Romans from each of the three translations above, as produced by the import.
The BSB's red-letter marking and the WEB's paragraphs in it come from the two USFM files above; no text from those files is committed.
Full datasets are downloaded by `pnpm import:bible` into `.cache/`, which git ignores.
