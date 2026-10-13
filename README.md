# Selah

A self-hostable, open source lifestream for daily Bible reading.

Look up or search a passage, compare translations, study it with cross references, footnotes, commentary and AI, highlight verses, and share highlights, notes and reflections to your own feed.
Inspired by Posterous, shaped like Ghost, built for Bible study.

Status: pre-MVP. The product spec and milestones are in [docs/spec.md](docs/spec.md).

## Local development

You need Node 22 or newer, pnpm and Docker.

```sh
docker compose up -d db    # Postgres 16 with pgvector on 127.0.0.1:5432
pnpm install
pnpm db:seed:fixture       # run migrations, then load the test fixture
pnpm dev                   # http://localhost:3000
```

| Command | What it does |
| :--- | :--- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `pnpm test` | Vitest unit tests; they need no database or network |
| `pnpm db:generate` | Generate a migration from changes to `src/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed:fixture` | Apply pending migrations, then load the fixture the end-to-end tests run against; safe to re-run |
| `pnpm import:bible` | Download the full BSB, WEB and KJV and load them; see [Bible data](#bible-data) |
| `pnpm fixture:bible` | Rebuild the committed Bible fixture from the pinned sources |
| `pnpm import:study` | Download and load the cross references, commentaries and study notes; see [Study data](#study-data) |
| `pnpm fixture:study` | Rebuild the committed study fixture from the pinned sources |
| `pnpm e2e:serve` | Build and serve on 127.0.0.1:3000 against the seeded database with the AI provider stubbed |
| `pnpm e2e` | Playwright tests; reuses a running `pnpm e2e:serve`, or starts one |

Before the first `pnpm e2e`, install the browser with `pnpm exec playwright install chromium`.

Configuration is read from the environment, with defaults that match `docker-compose.yml`, so a fresh clone needs no `.env` file.
To change something, copy `.env.example` to `.env`.

AI and embeddings calls go through one provider module, `src/lib/ai`, selected by `AI_PROVIDER`.
Tests and `pnpm e2e:serve` use the `stub` provider, which is deterministic and never touches the network.

## Bible data

`pnpm db:seed:fixture` loads a small fixture, enough for development and the tests: Psalms, John and Romans in the Berean Standard Bible (BSB, the default), the World English Bible (WEB) and the King James Version (KJV).

To load the whole Bible in all three translations:

```sh
pnpm import:bible          # all three, about 93,000 verses
pnpm import:bible bsb      # or only the ones you name: bsb, web, kjv
```

It applies pending migrations, downloads each translation from the [Free Use Bible API](https://bible.helloao.org/) into `.cache/bible/` (ignored by git), verifies it against the checksum pinned in `src/lib/bible/import/sources.ts`, and loads the `translation` and `verse` tables.
Two translations need a second download, from their publishers, for formatting the API leaves out: the BSB's red-letter text (berean.bible) and the WEB's prose paragraphs (ebible.org).
These are pinned and verified the same way, and only their formatting is used: the words of every verse come from the first file. [DATA-LICENSES.md](DATA-LICENSES.md) says how the two are matched and what is left out.
It is safe to re-run: a second run reuses the cached files and changes nothing.

If it stops with a checksum mismatch, the upstream text (or, for a second download, its text or formatting) has changed since it was pinned.
Review the change, update the pin, and run `pnpm fixture:bible` to rebuild the fixture from the new text.

Each verse is stored as plain text with its headings, footnotes, paragraph breaks and red-letter spans beside it as structured JSON (the shapes are in `src/lib/bible/types.ts`).
Verses are keyed by a canonical id, `BBCCCVVV` (John 3:16 is `43003016`), shared by every translation; `src/lib/bible` has the helpers and explains how numbering differences between translations are handled.

## Study data

The study panel reads cross references, commentary and study notes from the database.
`pnpm db:seed:fixture` loads a small fixture of each (Psalm 23, John 3:16-21 and Romans 8:28-30). To load all of it:

```sh
pnpm import:study                    # everything, about 345,000 cross references and 61,000 entries
pnpm import:study cross-references   # or only the ones you name: cross-references,
                                     # matthew-henry, jamieson-fausset-brown, adam-clarke, tyndale
```

| Content | Published by | License |
| :--- | :--- | :--- |
| Cross references, with readers' votes | [OpenBible.info](https://www.openbible.info/labs/cross-references/) | CC BY 4.0 |
| Matthew Henry, Jamieson-Fausset-Brown and Adam Clarke | [CrossWire Bible Society](https://crosswire.org/sword/modules/ModDisp.jsp?modType=Commentaries) SWORD modules | Public domain |
| Tyndale Open Study Notes | [Tyndale House Publishers](https://tyndaleopenresources.com/) | CC BY-SA 4.0 |

Like the Bible import, it downloads each source into `.cache/bible/`, verifies it against the checksum pinned in `src/lib/study/sources.ts`, and is safe to re-run; it takes about half a minute.
A checksum mismatch means the upstream content has changed: review it, update the pin, and run `pnpm fixture:study`.
OpenBible.info counts votes as they come in, so its pin is the one most likely to need this.

Cross references are stored in `cross_ref`, and commentary and notes in `commentary_entry`, each entry on an inclusive range of verse ids: a verse, a section, a chapter (its introduction) or a book.
Every entry belongs to a `commentary_source` row carrying its license and attribution.
The sources' markup is never printed as it arrives: the import reduces it to a handful of tags (`src/lib/study/html.ts`), and the page passes what was stored through the same sanitizer again.
[DATA-LICENSES.md](DATA-LICENSES.md) has each license and what the import changes.

## Reader

`/read` is the reader: type a reference in the box (`John 3:16-21`, `jn3.16`, `Ps 23`, `John 3:16-18, 22; 4:1-3`) and read the passage with verse numbers, headings, footnotes, paragraphs and red-letter text.
Every passage has its own URL, and the `t` parameter picks the translations: one for the plain reader, two to four for the parallel view, where each verse is a row so the translations stay aligned.

| URL | Shows |
| :--- | :--- |
| `/read/john-3.16-21` | John 3:16-21 in the default translation (BSB) |
| `/read/psalm-23?t=web` | Psalm 23 in the WEB |
| `/read/john-3.16-21?t=bsb,web,kjv` | Three translations side by side |
| `/read/john-3?v=john-3.16` | John 3 with verse 16 selected and the study panel open on it |
| `/read/jn3.16`, `/read?q=jn3.16` | Redirect to `/read/john-3.16` |

Click a verse, or follow its number from the keyboard, to study it: a panel opens with the verse's cross references ranked by votes, its footnotes, the commentaries and the Tyndale study notes, each with its attribution.
The selected verse is the `v` parameter, so a studied verse can be linked; Escape or Close clears it.
In the parallel view the panel quotes cross references from the first translation and lists the footnotes of each.

The pieces, for anyone building on them:

- `src/lib/bible/reference.ts`: the reference parser. `parseReference(text)` returns verse-id ranges or an error with a message for the reader; `formatReference(ranges)` and `referenceSlug(ranges)` write them back as text and as a URL segment.
- `src/lib/bible/layout.ts`: turns stored verses into blocks of text with footnote markers and red-letter spans in place.
- `src/components/passage/passage.tsx`: `<Passage>` and `<ParallelPassage>` render those blocks with the translation's attribution.
- `src/lib/verse-selection.ts` and `src/components/study/verse-select.tsx`: which verses are selected (the `v` parameter, a list of ranges) and the click handling that changes it.
- `src/lib/study/queries.ts`: `getCrossReferences(db, range)` and `getCommentary(db, range)`, which `src/components/study/study-panel.tsx` renders.
- `src/lib/site.ts`: where the default translation is chosen.

## Search

One box serves the reader and the search page. A reference typed in it opens the passage; anything else searches the text of every translation stored locally, with Postgres full-text search (English stemming, so `believing` finds "believes").

| URL | Shows |
| :--- | :--- |
| `/search?q=living+water` | Verses with both words, in the default translation, best match first |
| `/search?q=living+water&t=all` | ... in every local translation (`t=bsb,kjv` for some) |
| `/search?q=shepherd&in=john` | ... in one book (`in=ot` or `in=nt` for a testament) |
| `/search?q=love&page=2` | The second page; 20 results a page |
| `/search?q=jn+4.10`, `/search?q=Romans` | Redirect to the reader |

All the words must be in the verse. `"quoted words"` must be together, `-word` leaves a word out, and `or` between words finds either.
Section headings and psalm titles are searched with the verse they are printed over, so `maskil` finds the psalms titled that way.
A word typed alone goes to the reader only when it is a book's full name (`John`, `Psalms`); abbreviations such as `is` or `judge` are searched for, with a link to the book, and a quoted `"john"` always is.

The pieces:

- `src/db/schema.ts`: `verse.search`, a generated `tsvector` column with a GIN index (migration `0003_verse_search`).
- `src/lib/bible/search.ts`: `searchVerses(db, request)`, the one function that retrieves and ranks. It returns hits with their text cut into matched and unmatched segments.
- `src/lib/search-url.ts`: the URL parameters, and `interpretQuery()`, which tells a reference from words to search for.
- `src/app/search/page.tsx` and `src/components/search/`: the page, its filters and the result list.

Limits: words too common to index ("the", "of") are ignored, and inside a quoted phrase such a word stands for any one word. Stemming is modern English, so in the KJV `love` does not find "loveth".

## License

Code: [MIT](LICENSE).
Bible texts, cross references and commentaries keep their own licenses; each source, its license and its attribution are listed in [DATA-LICENSES.md](DATA-LICENSES.md).
