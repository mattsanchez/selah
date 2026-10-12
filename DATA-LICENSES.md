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

### World English Bible

This is the edition without the Deuterocanon (eBible.org id `engwebp`).
Its page says:

> The World English Bible is in the Public Domain. That means that it is not copyrighted. However, "World English Bible" is a Trademark of eBible.org. […] All we ask is that if you CHANGE the actual text of the World English Bible in any way, you not call the result the World English Bible any more.

Selah does not change the words of the text.
See "What the import changes" below for the one place it changes a verse number.

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

## What the import changes

The words of each translation are stored as published. The import changes only the following:

- Formatting is reduced to plain text, with a line break between lines of poetry. Paragraph breaks and the marking of the words of Jesus are not kept.
- KJV: the paragraph mark (¶) at the start of a verse is removed, and so is the chapter-and-verse prefix of each footnote ("3.3 for: or, about" becomes "for: or, about").
- WEB: the closing doxology of Romans, which the WEB prints as Romans 14:24-26, is stored under Romans 16:25-27, where the KJV and BSB have it, so that one verse id means the same words in every translation. The WEB's footnotes there explain the two placements.
- WEB: four verses the WEB leaves empty except for a footnote (Luke 17:36, Acts 8:37, Acts 15:34 and Acts 24:7), and its empty Romans 16:25, are not stored as verses; each footnote is kept on the verse before.

## In this repository

The only Bible text committed to git is the test fixture in `src/db/seed/fixtures/bible/`: Psalms, John and Romans from each of the three translations above, as produced by the import.
Full datasets are downloaded by `pnpm import:bible` into `.cache/`, which git ignores.
