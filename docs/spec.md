# Selah: product spec and MVP scope

Repo: `git@github.com:mattsanchez/selah.git` (public, MIT).
A personal open source project: inspired by Posterous, shaped like Ghost today (self-hostable publishing you own), specialized for Bible study and lifestreaming.

## Problem

People who read the Bible daily want to capture a passage and write about it, the way Posterous allowed: highlight, paste, reflect, publish.
Posterous is gone, and it never knew it was holding scripture: no lookup, no translations, no cross references, no commentary, no way to ask a question or find related passages.
Ghost is a great open source publisher but knows nothing about scripture either.

## Product in one line

A self-hostable, open source lifestream for daily Bible reading: look up or search a passage, compare translations, study it with cross references, footnotes, commentary and AI, highlight verses, and share highlights and reflections to your own feed.

## Positioning

- **Like Ghost:** you own the site and data; one install serves one writer (or a few); clean public site, RSS, permalinks, tags, a good default theme; import/export as JSON and Markdown.
- **Like Posterous:** fast, low-friction posting; short items and long ones in one stream.
- **Unlike both:** the Bible is built in, and every item in the stream is anchored to passages.

## Users

- **Writer**: owns an install, reads daily, highlights and posts. The MVP's first real user is Matt.
- **Reader**: visits a writer's public feed or RSS. No account needed.

## Feed item types

- **Highlight**: one or more verses with a color, optional one-line note. Private by default; "Share" puts it in the feed.
- **Reflection**: a full post (Markdown) with embedded passage cards, tags, title optional.
- **Note**: a short text item, optionally anchored to a passage (the Posterous quick post).

All three share one stream, one permalink scheme, tags, visibility (private, unlisted, public) and the passage index, so "everything on Romans 8" finds all of them.

## MVP journeys (each becomes a Playwright journey gate)

1. **Install and set up.** `docker compose up` on a fresh machine, open the site, create the owner account (email + password or magic link), set site title, handle, default translation.
2. **Look up a passage.** Type `John 3:16-21`, `jn3.16`, or `Ps 23` and see it in the default translation, with verse numbers, headings and footnotes.
3. **Compare translations.** Parallel view of 2-4 translations for the same passage.
4. **Search the Bible.** Keyword search ("living water") and meaning search ("verses about anxiety"), filterable by book or testament; results open in the reader.
5. **Study a verse.** Click a verse: side panel with cross references (ranked), footnotes, public-domain commentary and Tyndale Open Study Notes.
6. **Highlight verses.** Select verses, pick a color, add an optional note. Highlights show in the reader across sessions and in a "My highlights" view filterable by color, book and date.
7. **Share to the feed.** From a highlight, "Share" publishes it as a feed item (passage card, color accent, note). From the reader, "Reflect" opens a reflection draft with the selected passage embedded; "Note" posts a quick item. Markdown editor with autosave, tags, visibility.
8. **Ask about a passage.** A chat panel scoped to the open passage. Answers cite verses and commentary as links and separate what the text says from interpretation. "Suggest related passages" inserts linked cards into a draft; AI never writes the reflection unasked.
9. **Public site.** Feed at `/`, item permalinks, tag pages, passage pages (`/passage/rom-8` lists my items on Romans 8), RSS/Atom, Open Graph cards so a shared highlight previews as the verse.
10. **Find my own past items.** Search my highlights, notes and reflections by text, tag, or passage, including items on overlapping passages; export everything as JSON + Markdown.

## Out of scope for the MVP

Themes beyond one default, newsletters and members (Ghost-style, a natural follow-up), following other installs (ActivityPub is the likely route), comments, reading plans, streaks, email-to-post, mobile apps, audio, Strong's/interlinear, payments.
First follow-ups: reading plans, ActivityPub, Strong's.

## Data model (core)

- `translation`(id, name, abbrev, license, attribution, source_url, provider: local | api)
- `verse`(translation_id, verse_id, text, headings and footnotes as structured JSON); canonical `verse_id` = `BBCCCVVV`, shared across translations
- `cross_ref`(from_verse, to_start, to_end, votes)
- `commentary_entry`(source_id, verse_start, verse_end, html)
- `passage_embedding`(verse window, vector)
- `user`, `site`(title, handle, default translation, settings)
- `item`(kind: highlight | reflection | note, markdown, note, color, visibility, published_at)
- `item_passage`(item_id, verse_start, verse_end, translation_id) – the passage index for every item kind
- `tag`, `item_tag`
- Every translation and commentary row carries its license and attribution; the UI shows it wherever the text appears.

## Bible data sources

MVP content is public domain or openly licensed, so it is stored, indexed and embedded locally with no API limits.

| Content | Source | License | Notes |
| :--- | :--- | :--- | :--- |
| BSB (default) | berean.bible data files | Public domain since 2023-04-30 | Modern; footnotes and headings |
| WEB | ebible.org (USFM/USX) | Public domain | Modern; footnotes |
| KJV | ebible.org | Public domain (Crown patent in the UK only) | |
| ASV, YLT, Darby | ebible.org | Public domain | Optional extras |
| Cross references | OpenBible.info (from the Treasury of Scripture Knowledge) | CC BY | Attribution "Cross references from OpenBible.info" |
| Commentary | Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, Barnes, Gill | Public domain | JSON via the Free Use Bible API (bible.helloao.org) |
| Study notes | Tyndale Open Study Notes | CC BY-SA 4.0 | Share-alike covers the notes, not our code |
| Bulk text and JSON | Free Use Bible API, bible.helloao.org | MIT code; each text keeps its notice; storage allowed | Single import path |

**Licensed translations (post-MVP, optional per install):** ESV, NIV, NASB, NLT, CSB, NKJV are copyrighted, and the code never ships their text.
Because Selah is non-commercial open source, a self-hoster can enable the ESV API with their own key: free for non-commercial sites (no ads, donations or paid access), at most 500 verses or half a book per query and in local cache, attribution plus a link to esv.org on every page.
API.Bible covers others under per-translation terms.
API-provided translations appear in lookup, parallel view and passage cards, but are never stored in bulk, searched or embedded.

## AI

- **Model**: Claude via the Anthropic API. Default `claude-sonnet-5-5` for Q&A; `claude-haiku-5-5` for small tasks (tag suggestions, reference-parsing fallback).
- **Optional per install**: AI is off until the owner adds an API key; everything else works without it.
- **Grounding**: retrieval over verses, cross references and commentary; answers must cite verse ids, rendered as links into the reader.
- **Embeddings**: Voyage AI for passage and item embeddings (Claude has no embeddings endpoint). Precompute for BSB and WEB at import; meaning search falls back to keyword search without a key.
- **Tone**: distinguish text from interpretation, name the tradition when quoting a commentator, no denominational default beyond the cited sources.
- **Cost**: daily question cap per install; cache answers per (passage, question).

## Recommended stack

One TypeScript repo, chosen so Quark's workers and verification gates can build and prove every journey end to end.

- **App**: Next.js (App Router), React Server Components, Tailwind + Radix.
- **Database**: Postgres 16 with `pgvector` and built-in full-text search (hybrid ranking). Drizzle ORM and migrations.
- **Auth**: Auth.js; owner account with email + password, magic link when SMTP is configured.
- **Packaging**: `docker compose up` runs app + Postgres; first boot runs migrations and the Bible import. That is the self-host story, like Ghost's.
- **Reference parser**: small, well-tested library in the repo (book names, abbreviations, ranges, multi-ranges).
- **Import pipeline**: `pnpm import:bible` downloads pinned sources with checksums, normalizes to canonical verse ids, loads Postgres. CI runs it on a fixture subset.
- **Tests**: Vitest for units; Playwright for the ten journeys against compose Postgres seeded with a fixture (John, Psalms, Romans) and a stubbed AI provider.
- **License**: MIT for the code; `DATA-LICENSES.md` lists every data source's license and attribution.

## Milestones (one GitHub issue each, in order)

1. **Scaffold**: Next.js, Postgres compose, Drizzle, lint/typecheck/test CI, Playwright harness, MIT license.
2. **Bible import**: BSB, WEB, KJV with headings and footnotes; canonical verse ids; `DATA-LICENSES.md`.
3. **Reader and reference parser**: journeys 2 and 3.
4. **Keyword search**: Postgres full-text across translations; journey 4 (keyword half).
5. **Study panel**: cross references, footnotes, commentaries, Tyndale notes; journey 5.
6. **Install and owner account**: first-boot setup, Auth.js, site settings; journey 1.
7. **Highlights**: select, color, note, "My highlights"; journey 6.
8. **Feed items**: reflections, notes, sharing highlights, editor, passage cards, tags, visibility; journey 7.
9. **Public site**: feed, permalinks, tag and passage pages, RSS, OG cards; journey 9.
10. **Embeddings and meaning search**: Voyage, hybrid search, related passages, my-items search, export; journeys 4 (meaning half) and 10.
11. **Ask**: grounded Q&A with citations, related-passage suggestions in drafts; journey 8.

Milestones 4-5 and 6-7 run in parallel after 3; 8 follows 6-7; 9 follows 8; 10 follows 4 and 8; 11 follows 5 and 10.
