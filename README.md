# Selah

A self-hostable, open source lifestream for daily Bible reading.

Look up or search a passage, compare translations, study it with cross references, footnotes, commentary and AI, highlight verses, and share highlights, notes and reflections to your own feed.
Inspired by Posterous, shaped like Ghost, built for Bible study.

Status: pre-MVP. The product spec and milestones are in [docs/spec.md](docs/spec.md).
You can already [run your own copy](#self-hosting): it has the Bible reader and the owner account; highlights, the feed and AI come next.

## Self-hosting

One install serves one writer. It is two containers, the app and Postgres, run by Docker Compose.

### Requirements

- Docker with Compose v2 (`docker compose version`), on Linux, macOS or Windows.
- About 1 GB of free memory and 1 GB of disk: the image is about 400 MB, the database with the three translations about 35 MB, and the downloaded source files about 25 MB.
- Outbound HTTPS on first boot, to the three hosts listed under [what first boot does](#what-first-boot-does).

### Start it

```sh
git clone https://github.com/mattsanchez/selah.git
cd selah
docker compose up -d
docker compose logs -f app     # shows progress and the setup link
```

The first `docker compose up` builds the image, which takes a few minutes. Nothing else needs installing or configuring.

When the app starts it prints a setup link to its logs:

```
Selah is not set up yet. To create the owner account, open:

  http://localhost:3000/setup?token=4lcL-cMg8eypPu3JwKcvKqMw
```

Open it, choose your email and password, the site title, your handle and the default translation, and optionally add AI keys.
That creates the owner account, signs you in and opens the reader.
Afterwards, sign in at `/sign-in` and change any of it at `/settings`.

### What first boot does

1. Waits for Postgres and applies database migrations. This happens on every start, so an upgrade migrates itself.
2. Starts the site. From here on it is reachable, and until there is an owner every page leads to the setup screen, which shows what is loading.
3. Downloads the three translations (BSB, WEB, KJV), checks each file against the checksum this version of Selah was released with, and loads them: about 93,000 verses. On a fast connection this takes under a minute (11 seconds on the machine it was last measured on); allow a few minutes on a slow one. The setup form appears when it is done.

The downloads come from these hosts, which the machine must be able to reach over HTTPS on first boot:

| Host | What |
| :--- | :--- |
| `bible.helloao.org` | The text, headings and footnotes of all three translations |
| `bereanbible.com` | Red-letter markup for the BSB |
| `ebible.org` | Paragraph breaks for the WEB |

After first boot Selah needs no outbound access (until you turn on AI or email).
No Bible text is in the image or the repository; [DATA-LICENSES.md](DATA-LICENSES.md) lists each source and its license.

If a download fails, the others still load, and the setup screen (and later the Settings page) says which source failed and why.
Setup can go ahead with whatever did load.

- **A host could not be reached**: each download is tried three times. Fix the connection and run `docker compose restart app`; first boot continues with what is missing, and what is already loaded is not downloaded or loaded again.
- **A file has changed** ("has changed since this version of Selah was released"): the publisher changed a file after it was pinned. Selah will not load text it has not been checked against, so retrying does not help: upgrade Selah, or [open an issue](https://github.com/mattsanchez/selah/issues).
- **"Loading stopped before it finished"**: the app was stopped mid-import. `docker compose restart app` picks it up.

### Who can set up a new install

Until the owner account exists, a new install would belong to whoever reaches it first.
So the setup screen asks for a **setup token**: a random value created at first boot, printed in the app's logs (`docker compose logs app`) and kept in the data volume.
Only someone who can read the server's logs can create the owner.
The token is deleted when the owner is created, and from then on the setup screen refuses to run; the database also refuses a second owner.
To choose the token yourself, set `SELAH_SETUP_TOKEN`.

### Configuration

Everything is optional. Put what you need in a `.env` file beside `docker-compose.yml` ([.env.example](.env.example) lists them) and run `docker compose up -d`.

| Variable | Default | What it does |
| :--- | :--- | :--- |
| `SELAH_URL` | unset | The public address of the site, e.g. `https://selah.example.org`. Set it when the site is reached by a name other than `localhost`. Required for sign-in links by email. |
| `SELAH_PORT` | `3000` | The port the site is published on. |
| `SELAH_BIND` | `127.0.0.1` | The address it is published on. The default is reachable from the same machine only; see [putting it on the internet](#putting-it-on-the-internet). |
| `SELAH_SECRET` | generated | The install's secret: it signs sessions and encrypts the saved AI keys. If unset, one is generated at first boot and kept in the data volume. If you set it, use at least 32 random characters (`openssl rand -base64 32`) and never change it: changing it signs everyone out and makes saved AI keys unreadable. |
| `SELAH_SETUP_TOKEN` | generated | The token the setup screen asks for; see above. |
| `SMTP_URL` | unset | An SMTP server, e.g. `smtp://user:password@smtp.example.org:587` (or `smtps://` for port 465). With `EMAIL_FROM` and `SELAH_URL`, turns on sign-in links by email. |
| `EMAIL_FROM` | unset | The sender of those emails, e.g. `Selah <selah@example.org>`. Required with `SMTP_URL`. |
| `ANTHROPIC_API_KEY` | unset | An Anthropic API key, instead of saving one in Settings. |
| `VOYAGE_API_KEY` | unset | A Voyage AI API key, instead of saving one in Settings. |
| `SELAH_DB_PORT` | `5432` | The port Postgres is published on, on `127.0.0.1` only. |

**Signing in.** The owner signs in with email and password.
Passwords are stored only as Argon2id hashes.
Ten wrong passwords for an email within fifteen minutes lock password sign-in for that email until the fifteen minutes pass.
When `SMTP_URL`, `EMAIL_FROM` and `SELAH_URL` are all set, the sign-in page also offers to email a sign-in link; the link works once, for fifteen minutes, and is only ever sent to the owner's address.
Sessions are encrypted cookies that last 30 days and survive restarts and upgrades.

**AI keys.** The AI features (later versions) are off until there is a key; everything else works without one.
A key can come from the environment (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`), which takes precedence, or be saved at setup or in Settings.
A saved key is encrypted (AES-256-GCM) with a key derived from the install's secret before it goes into the database, so a database dump alone does not reveal it.
Once saved it is never sent back to the browser, not even masked: Settings says only that a key is saved, and lets you replace or remove it.
Keys are not written to the logs.

**Forgotten password.** With email configured, use a sign-in link. Otherwise set a new one from the server, which also signs out every session:

```sh
docker compose exec app node boot.mjs reset-password
```

### Putting it on the internet

By default the site is published on `127.0.0.1` only, and it speaks plain HTTP.
To serve it publicly, put a reverse proxy that terminates TLS (Caddy, nginx, Traefik) in front of it on the same machine, pointing at `127.0.0.1:3000`, and set `SELAH_URL` to the public `https://` address.
The proxy must pass the `Host` header and set `X-Forwarded-Proto`; Caddy does both by default.
Finish setup before you publish the address, or keep the setup token private until you have.
Setting `SELAH_BIND=0.0.0.0` publishes the plain-HTTP port on every network interface; do that only on a network you trust, since passwords would cross it unencrypted.

Postgres is published on `127.0.0.1` only, with the password in `docker-compose.yml`. Do not publish it further without changing that password.

### Backups

Two things hold your data:

- **The database** (volume `db-data`): your account, settings and, in later versions, everything you write. The Bible text is in it too, but that can always be downloaded again.
- **The install's secret** (volume `app-data`, file `secret`), unless you set `SELAH_SECRET` yourself. Without it a restored database still works, but you sign in again and re-enter any saved AI keys.

```sh
docker compose exec -T db pg_dump -U selah --clean --if-exists selah | gzip > selah-$(date +%F).sql.gz
docker compose exec -T app cat /data/secret > selah-secret.txt     # keep this private
```

To restore onto a new machine: clone the repository, put the secret back (set `SELAH_SECRET` in `.env` to the contents of `selah-secret.txt`), then:

```sh
docker compose up -d db
gunzip -c selah-2026-10-12.sql.gz | docker compose exec -T db psql -U selah selah
docker compose up -d
```

### Upgrades

```sh
git pull
docker compose up -d --build
```

Back up first.
Starting the new version applies any new migrations before the site comes up, and first boot runs again for whatever the new version loads that the old one did not (a new source, or a translation whose pinned file changed); everything else is skipped.
Your account, settings and writing are not touched.

## Local development

You need Node 22 or newer, pnpm and Docker.

```sh
docker compose up -d db    # Postgres 16 with pgvector on 127.0.0.1:5432
pnpm install
pnpm db:seed:fixture       # run migrations, then load the test fixture
pnpm dev                   # http://localhost:3000
```

A database without an owner sends every page to `/setup`. The setup token it asks for is printed in the `pnpm dev` console the first time the setup screen is shown, and kept in `.data/setup-token`.
To skip setup, seed the test owner as well: `SELAH_SEED_TEST_OWNER=1 pnpm db:seed:fixture` creates `owner@selah.test` with the password in `src/db/seed/test-owner.ts`. Never use that flag on a real install.

| Command | What it does |
| :--- | :--- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `pnpm test` | Vitest unit tests; they need no database or network |
| `pnpm db:generate` | Generate a migration from changes to `src/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed:fixture` | Apply pending migrations, then load the fixture the end-to-end tests run against; safe to re-run |
| `pnpm import:bible` | Download the full BSB, WEB and KJV and load them; see [Bible data](#bible-data) |
| `pnpm first-boot` | What a Docker install does on first boot, without the app: migrations, then the first-boot steps |
| `pnpm build:boot` | Bundle the Docker image's entry point, `scripts/boot.ts`, to `dist/boot.mjs` |
| `pnpm fixture:bible` | Rebuild the committed Bible fixture from the pinned sources |
| `pnpm import:study` | Download and load the cross references, commentaries and study notes; see [Study data](#study-data) |
| `pnpm fixture:study` | Rebuild the committed study fixture from the pinned sources |
| `pnpm e2e:serve` | Build and serve on 127.0.0.1:3000 against the seeded database with the AI provider stubbed |
| `pnpm e2e` | Playwright tests; reuses a running `pnpm e2e:serve`, or starts one. It also seeds the test owner and starts a second server for journey 1; see [Owner account](#owner-account-and-settings) |

Before the first `pnpm e2e`, install the browser with `pnpm exec playwright install chromium`.

Configuration is read from the environment, with defaults that match `docker-compose.yml`, so a fresh clone needs no `.env` file.
To change something, copy `.env.example` to `.env`.
The secret and the setup token are generated on first use into `.data/` (ignored by git); set `SELAH_DATA_DIR` to keep them elsewhere.
`E2E_PORT` moves the end-to-end servers off ports 3000 and 3001.

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
| `/read/john-3.16-21` | John 3:16-21 in the site's default translation |
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
- `src/lib/site.ts`: the site settings, including the default translation.

## Owner account and settings

For anyone building on them:

- **Who is signed in**: `src/lib/auth/owner.ts`. `getOwner()` returns `{ id, email }` or `null`; `requireOwner(next?)` returns the owner or redirects to `/sign-in` (and back to `next` afterwards). Call `requireOwner()` at the top of every owner-only page and of every server action that changes something; a page's check does not protect the actions it renders. In a route handler, call `getOwner()` and answer 401 yourself. Nothing else should read the session; the Auth.js configuration is `src/auth.ts`.
- **Until there is an owner**, `src/proxy.ts` sends every page to `/setup`. That is all it does; it is not an access check.
- **Site settings**: `getSite()` in `src/lib/site.ts` returns the one `site` row (`title`, `handle`, `defaultTranslationId`, `settings`), read once per request. `settings` is typed by `SiteSettings` in `src/lib/site-settings.ts`; add new settings there.
- **AI keys**: `getAiKeys()` in `src/lib/ai/keys.ts` returns `{ anthropic?, voyage? }`, from the environment or the encrypted settings. Server-only: never pass a key to a client component or return it from a server action.
- **Email**: `getMailer()` in `src/lib/email` (undefined when no SMTP is configured). With `EMAIL_TRANSPORT=stub` it writes each message to `<data dir>/outbox/` and sends nothing; tests use that.
- **First boot**: the ordered list is `firstBootSteps` in `scripts/first-boot-steps.ts`. Append new imports there, one `importStep({ id, title, version, what, load })` each: `version` is what the step loads (its pinned checksums; a done step runs again only when it changes) and `load` must be idempotent. Steps are independent: a failed one is recorded with a message and the rest still run. Downloads go through `download(urls)` in `src/lib/bible/import/download.ts`, which tries a list of URLs in order, so a mirror is a second URL. Progress is kept in the `boot_step` table; the runner is `src/lib/first-boot/runner.ts`.
- **Tests**: `pnpm e2e` runs two servers from one build. The fixture server has the seeded fixture and a test owner; a spec that needs the owner signed in says `test.use({ storageState: OWNER_STATE })` (from `e2e/owner.ts`), and is a signed-out visitor otherwise. Journey 1 runs against a second server and a database with no owner, recreated for each run (`e2e/fresh-install/`, `scripts/e2e-fresh-install.ts`). Tests on the fixture server run in parallel and share the site settings, so they must not change the title or the default translation.

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
