# Selah

A self-hostable, open source lifestream for daily Bible reading.

Look up or search a passage, compare translations, study it with cross references, footnotes, commentary and AI, highlight verses, and share highlights, notes and reflections to your own feed.
Inspired by Posterous, shaped like Ghost, built for Bible study.

Status: pre-MVP. The product spec and milestones are in [docs/spec.md](docs/spec.md).
You can already [run your own copy](#self-hosting): it has the Bible reader, the owner account, verse highlights, reflections and notes with tags and visibility, the public site with its feeds, search by meaning with a Voyage AI key, grounded questions about a passage with an Anthropic key, and export of everything you have made.

## Self-hosting

One install serves one writer. It is two containers, the app and Postgres, run by Docker Compose.

### Requirements

- Docker with Compose v2 (`docker compose version`), on Linux, macOS or Windows.
- About 1 GB of free memory and 1 GB of disk: the image is about 400 MB, the database with everything loaded about 150 MB, and the downloaded source files about 60 MB.
- Outbound HTTPS on first boot, to GitHub or to the six publishers' hosts listed under [what first boot does](#what-first-boot-does).

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
3. Downloads each source in the table below, checks each file against the checksum this version of Selah was released with, and loads it. Each file is asked for in two places: first Selah's own copy on GitHub (the [mirror](#where-the-files-come-from)), then its publisher. Each source is its own step, in this order, and a step that fails does not stop the others. On a fast connection all of it takes under a minute; allow several minutes on a slow one, since the downloads total about 60 MB. The setup form appears when every step has finished or failed.

| Step | Loads | Publisher's hosts |
| :--- | :--- | :--- |
| Berean Standard Bible (BSB) | 31,086 verses, with red-letter text | `bible.helloao.org`, `bereanbible.com` |
| World English Bible (WEB) | 31,098 verses, with paragraph breaks | `bible.helloao.org`, `ebible.org` |
| King James Version (KJV) | 31,102 verses | `bible.helloao.org` |
| Cross references (OpenBible.info) | About 345,000 cross references with readers' votes | `a.openbible.info` |
| Matthew Henry's Commentary | 5,378 entries | `crosswire.org` |
| Jamieson, Fausset and Brown's Commentary | 16,943 entries | `crosswire.org` |
| Adam Clarke's Commentary | 22,077 entries | `crosswire.org` |
| Tyndale Open Study Notes | 16,913 notes | `tyndaleopenresources.com` |

#### Where the files come from

The publishers' addresses are not versioned: a publisher can change a file at any time, and Selah will not load a file that differs from the one it was checked against.
So a copy of every file, exactly as it was when its checksum was pinned, is attached to a [data release](#data-releases) of this repository, and first boot asks there first:

| Host | What |
| :--- | :--- |
| `github.com` | Selah's mirror: the data release this version was pinned against, <https://github.com/mattsanchez/selah/releases/tag/data-v1> |
| `release-assets.githubusercontent.com` | Where GitHub serves a release's files from; `github.com` redirects there |

When the mirror cannot be reached, or a file is not in it, the file is downloaded from its publisher instead:

| Host | What |
| :--- | :--- |
| `bible.helloao.org` | The text, headings and footnotes of all three translations |
| `bereanbible.com` | Red-letter markup for the BSB |
| `ebible.org` | Paragraph breaks for the WEB |
| `a.openbible.info` | Cross references |
| `crosswire.org` | The three commentaries |
| `tyndaleopenresources.com` | Tyndale Open Study Notes |

Either set of hosts is enough: with GitHub reachable, first boot completes without the six publishers, and the other way round, as long as each publisher's file is still the one that was pinned.
The same checksum is checked whichever place served the file, so the mirror is trusted no more than a publisher is.
The setup screen and the Settings page say where each step's files came from ("Downloaded from the mirror at github.com."), and so do the app's logs.

`SELAH_DATA_MIRROR` changes this (see [Configuration](#configuration)): `off` downloads from the publishers only, and a URL names a mirror of your own, which must serve each file under the name it has in the data release.

After first boot Selah needs no outbound access (until you turn on AI or email; meaning search reaches `api.voyageai.com`, and Ask reaches `api.anthropic.com`).
No Bible text, cross references or commentary is in the image, and the repository holds only the small test fixture; [DATA-LICENSES.md](DATA-LICENSES.md) lists each source and its license.

If a download fails, the others still load, and the setup screen (and later the Settings page) says which source failed and why.
Setup can go ahead as long as at least one translation loaded.
A missing study source only leaves its section of the reader's study panel empty ("No cross references for this verse.").

- **A host could not be reached**: a file fails this way only when neither the mirror nor its publisher could serve it, and the message names both. Each download is tried three times. Fix the connection and run `docker compose restart app`; first boot continues with what is missing, and what is already loaded is not downloaded or loaded again.
- **A file has changed** ("has changed since this version of Selah was released"): the publisher changed a file after it was pinned. With the mirror reachable this is not an error, because the mirror has the pinned copy: the step loads from it. It fails only when the mirror could not be reached as well (then restoring access to `github.com` and restarting fixes it), or with `SELAH_DATA_MIRROR=off`. Selah will not load text it has not been checked against, so without the mirror retrying does not help: upgrade Selah, or [open an issue](https://github.com/mattsanchez/selah/issues). The cross references are the likeliest to do this: OpenBible.info rebuilds its file daily with its readers' latest votes.
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
| `SELAH_DATA_MIRROR` | Selah's data release on GitHub | Where first boot asks for each source file before it asks the publisher. `off`: the publishers only. A URL, e.g. `https://files.example.org/selah`: your own copy of the [data release](#data-releases)'s files, each under the same name. Every file is checked against the same checksum wherever it came from. |
| `SMTP_URL` | unset | An SMTP server, e.g. `smtp://user:password@smtp.example.org:587` (or `smtps://` for port 465). With `EMAIL_FROM` and `SELAH_URL`, turns on sign-in links by email. |
| `EMAIL_FROM` | unset | The sender of those emails, e.g. `Selah <selah@example.org>`. Required with `SMTP_URL`. |
| `ANTHROPIC_API_KEY` | unset | An Anthropic API key, instead of saving one in Settings. Turns on [Ask](#ask). |
| `VOYAGE_API_KEY` | unset | A Voyage AI API key, instead of saving one in Settings. |
| `SELAH_DB_PORT` | `5432` | The port Postgres is published on, on `127.0.0.1` only. |

**Signing in.** The owner signs in with email and password.
Passwords are stored only as Argon2id hashes.
Ten wrong passwords for an email within fifteen minutes lock password sign-in for that email until the fifteen minutes pass.
When `SMTP_URL`, `EMAIL_FROM` and `SELAH_URL` are all set, the sign-in page also offers to email a sign-in link; the link works once, for fifteen minutes, and is only ever sent to the owner's address.
Sessions are encrypted cookies that last 30 days and survive restarts and upgrades.

**AI keys.** AI is off until there is a key; everything else works without one. An Anthropic key turns on [Ask](#ask); a Voyage AI key turns on [meaning search](#meaning-search). Either works without the other.
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
| `pnpm embed:bible` | Embed the verse windows of the BSB and the WEB, and any items waiting, with the install's provider; `pnpm embed:bible kjv` names the translations. Stops and resumes safely; see [meaning search](#meaning-search) |
| `pnpm fixture:study` | Rebuild the committed study fixture from the pinned sources |
| `pnpm data:release` | Stage the [data release](#data-releases) from the download cache and verify it; with `--publish`, publish it |
| `pnpm data:check` | Compare every pinned source with what its publisher serves today and print what changed; see [checking upstream for changes](#checking-upstream-for-changes) |
| `pnpm e2e:serve` | Build and serve on 127.0.0.1:3000 against the seeded database with the AI provider stubbed (its answers are canned) |
| `pnpm e2e` | Playwright tests; reuses a running `pnpm e2e:serve`, or starts one. It also seeds the test owner and starts a second server for journey 1; see [Owner account](#owner-account-and-settings) |

Before the first `pnpm e2e`, install the browser with `pnpm exec playwright install chromium`.

Configuration is read from the environment, with defaults that match `docker-compose.yml`, so a fresh clone needs no `.env` file.
To change something, copy `.env.example` to `.env`.
The secret and the setup token are generated on first use into `.data/` (ignored by git); set `SELAH_DATA_DIR` to keep them elsewhere.
`E2E_PORT` moves the end-to-end servers off ports 3000 and 3001.

AI and embeddings calls go through one provider module, `src/lib/ai`. `AI_PROVIDER` decides when it is set; unset, a Voyage key turns on the real embeddings.
Tests and `pnpm e2e:serve` use the `stub` provider, which is deterministic and never touches the network.
Its vectors are hashed bags of words, **not semantic**: two texts are close only as far as they share words, so "fear" and "afraid" are strangers. They prove the plumbing, not the quality of the results.

## Bible data

`pnpm db:seed:fixture` loads a small fixture, enough for development and the tests: Psalms, John and Romans in the Berean Standard Bible (BSB, the default), the World English Bible (WEB) and the King James Version (KJV).

To load the whole Bible in all three translations:

```sh
pnpm import:bible          # all three, about 93,000 verses
pnpm import:bible bsb      # or only the ones you name: bsb, web, kjv
```

It applies pending migrations, downloads each translation into `.cache/bible/` (ignored by git), from Selah's [mirror](#data-releases) or else from the [Free Use Bible API](https://bible.helloao.org/), verifies it against the checksum pinned in `src/lib/bible/import/sources.ts`, and loads the `translation` and `verse` tables.
Two translations need a second download, from their publishers, for formatting the API leaves out: the BSB's red-letter text (berean.bible) and the WEB's prose paragraphs (ebible.org).
These are pinned and verified the same way, and only their formatting is used: the words of every verse come from the first file. [DATA-LICENSES.md](DATA-LICENSES.md) says how the two are matched and what is left out.
It is safe to re-run: a second run reuses the cached files and changes nothing.

If it stops with a checksum mismatch, the upstream text (or, for a second download, its text or formatting) has changed since it was pinned, and the mirror could not supply the pinned copy.
Updating a pin is deliberate, reviewed work: see [refreshing a source](#refreshing-a-source).

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

Like the Bible import, it downloads each source into `.cache/bible/`, from the mirror or else from its publisher, verifies it against the checksum pinned in `src/lib/study/sources.ts`, and is safe to re-run; it takes about half a minute.
A checksum mismatch means the upstream content has changed and the mirror could not supply the pinned copy; see [refreshing a source](#refreshing-a-source).
OpenBible.info counts votes as they come in, so its file is the one that changes most often.

Cross references are stored in `cross_ref`, and commentary and notes in `commentary_entry`, each entry on an inclusive range of verse ids: a verse, a section, a chapter (its introduction) or a book.
Every entry belongs to a `commentary_source` row carrying its license and attribution.
The sources' markup is never printed as it arrives: the import reduces it to a handful of tags (`src/lib/study/html.ts`), and the page passes what was stored through the same sanitizer again.
[DATA-LICENSES.md](DATA-LICENSES.md) has each license and what the import changes.

## Data releases

All ten pinned source files are mirrored as assets of a GitHub release of this repository that holds data only: a *data release*, tagged `data-v1`, `data-v2` and so on.
That is the three translations, the two formatting archives, the cross references, the three commentaries and the study notes; none is left to its publisher alone.
The three commentaries are the CrossWire Bible Society's SWORD module packages: the commentary text is public domain, and each module's own `DistributionLicense` field is `Public Domain`. [DATA-LICENSES.md](DATA-LICENSES.md#selahs-mirror-of-these-files) gives the terms each file is mirrored under.
It is not a version of Selah and holds no code. GitHub lists it as a pre-release: that is the one marking that keeps GitHub from ever presenting a data release as the latest version of Selah.
No dataset is committed to git.

A data release holds:

- each pinned file, byte for byte as its publisher served it, named `<source id>-<first 12 characters of its pin>.<json|zip>` (the name it has in `.cache/bible/`);
- `NOTICES.md`, with each file's license, attribution and notice;
- `MANIFEST.json`, with, for each file: its upstream URL and publisher's page, when this copy was downloaded, its size, the SHA-256 of its bytes, the pin it satisfies and the function that computes that pin, its license and its attribution.

`DATA_RELEASE` in `src/lib/bible/import/mirror.ts` names the data release this version of the code is pinned against, and the mirror URL is derived from it there and nowhere else: `https://github.com/mattsanchez/selah/releases/download/<DATA_RELEASE>/<file name>`.
A published data release is never edited or deleted, because older versions of Selah look for their files under its tag. Several exist side by side.

### Publishing one

```sh
pnpm data:release             # stage in .cache/data-release/<tag>/ and verify; publishes nothing
pnpm data:release --publish   # also publish it, with the gh CLI
```

A maintainer runs this on purpose. Nothing runs it automatically, and it refuses to run in CI.
It needs the [`gh` CLI](https://cli.github.com/) signed in with write access to the repository; it creates no token.

1. It fills `.cache/bible/` with any pinned file not already there, and checks every file against its pin.
2. It stages the files, `MANIFEST.json` and `NOTICES.md`. **A file that is missing or does not match its pin stops it, and nothing is staged or published.**
3. With `--publish`: it checks the staged files against their pins once more, creates the release as a draft, uploads the files, and publishes it as a pre-release that is not the latest. If the tag is already published with the same files it does nothing; with different files it refuses, and `DATA_RELEASE` must name a new tag. A draft left by an interrupted run is completed.

The license notices are written in `src/lib/data-release/catalog.ts`; a source with no notice there cannot be released.
Only public-domain or openly licensed files may be mirrored. A file whose terms do not allow it is marked `upstreamOnly` on its source, and is then left out of the release and downloaded from its publisher only.

### Checking upstream for changes

The publishers change their files without notice, and nothing fails when they do, because installs load the pinned copies from the mirror.
So a scheduled job looks for changes, and files what it finds as issues to plan like any other work.

Every Monday the `Upstream check` workflow (`.github/workflows/upstream-check.yml`) runs `pnpm data:check --file-issues`.
For each file in the catalog (`pinnedFiles()` in `src/lib/data-release/catalog.ts`, the same list the data release is built from) it downloads the publisher's copy and the pinned copy from the data release, reads both with the import's own readers, and compares the verses, entries or cross references the import would load from each.
It only reads: it never changes a pin, the fixture, the download cache or the mirror.

Each source gets one or more of these classifications:

| Classification | What it means | Significant when |
| :--- | :--- | :--- |
| Rebuild | The publisher's file has other bytes, and the import reads the same content from it: a new build date, changed metadata, spacing, or markup the import sets aside. | Never |
| Wording | The words of a verse changed. The issue says how many verses, with examples. | Any verse |
| Verses added, removed or renumbered | A verse is new, gone, or has the same words under another number. | Any verse |
| Formatting | A verse has the same words and other paragraph or line breaks, red-letter spans, headings or footnotes. | More than 5 verses |
| Entries | Commentary entries or study notes were added, removed, moved to other verses or reworded, or their markup changed. | Any entry |
| Cross references | References were added or removed, or their votes changed. OpenBible.info rebuilds its file daily, so some of this happens every week. | More than 1% of the pinned references added or removed, or more than 1% voted across zero, where the study panel stops showing a reference |
| License or attribution | What the file says about its own terms changed: the license fields of a translation's JSON, `copr.htm` in the WEB's archive, the header line of the cross references, the license lines of a SWORD module's `.conf`, the study notes' `_README.txt`. | Any change |
| Unreachable | The publisher did not serve the file, or served something that is not it. | Once it has lasted six days (see below) |
| Moved | The pinned address redirects to another host or path. | Once it has lasted six days |
| Divergence | For a translation read from two sources (the BSB and the WEB: the text from the Free Use Bible API, the formatting from the publisher's USFM), the verses on which the two disagree, with today's files against the pinned ones, and the verses whose formatting the import could not place because of it. Reported when either file changed. | Any verse on which they newly disagree |
| Unreadable, unclassified | The file changed and the import's reader fails on the new one, or there was no pinned copy to compare it with. | Always |

The thresholds are in one file, `src/lib/data-release/upstream-check/config.ts`, with the label and the number of examples an issue gives.
A source with nothing significant files nothing; the run's log and summary still say what was found.

**Issues.** A significant change files one issue per source, labeled `upstream-refresh` (the label is created when missing), with the findings and a recommendation:

- **refresh**: the changes are of the kind a refresh takes in.
- **wait**: the source has moved away from the same translation's other source, so more of its formatting would go unplaced; refresh when the other has caught up, or both together.
- **investigate**: the license changed, verses were renumbered, the source is unreachable or has moved, or the import cannot read the new file.

The issue for a source is found again by a marker in its body (`<!-- selah-upstream-check {"source": ...} -->`) together with the label, not by its title, so it can be retitled.
While it is open, later runs edit its description in place, and add a comment only when the classifications or the recommendation change.
It is closed by the check when the source matches its pin again, which is what happens after a refresh is merged.
If you close it yourself without refreshing, it is not filed again until the publisher's file changes again; to put a refresh off without hearing more, leave it open.

**Unreachable sources.** One failed download files nothing. Each run records since when a source has been unreachable (or moved) and hands that to the next run as a workflow artifact, `upstream-check-state`; a source is reported once that is six days or more, which with the weekly schedule is the second Monday in a row. A run that reaches the source starts the count over. Within one run a download is tried three times.

**By hand.**

```sh
pnpm data:check                 # every source; prints the findings and any issue it would file
pnpm data:check bsb tyndale     # only the sources named
pnpm data:check --file-issues   # also file, update and close the issues, with the gh CLI
```

Without `--file-issues` it is a dry run: it downloads about 60 MB, reads the existing issues if `gh` is signed in, and changes nothing.
The workflow can also be started from the Actions tab (`Run workflow`), with a dry-run option, and runs as a dry run on any pull request that changes the check.

**Acting on an issue.** Read the findings, then follow [refreshing a source](#refreshing-a-source) and close the issue from that pull request. For *wait*, leave the issue open: it is brought up to date every week. For *investigate*, settle the question the issue names first (the new license, the new address, the renumbered verses), which may end in a refresh, a code change or closing the issue.

Limits: the license check reads only what is inside a file, not the publisher's web page, and the BSB's USFM archive carries no license statement at all; a verse whose words changed is counted once, under wording, whatever else changed in it; and examples are a few per finding, so the full list of changed verses comes from running the import on the new file.

### Refreshing a source

When a publisher changes a file, installs keep working from the mirror, so a refresh is never urgent and never automatic. It is one reviewed pull request:

1. Download the new file and review what changed (wording, verse numbering, formatting, license). The [upstream check](#checking-upstream-for-changes)'s issue for the source, or `pnpm data:check <source id>`, says what to look for.
2. Update its pin in `src/lib/bible/import/sources.ts` or `src/lib/study/sources.ts`, and check its entry in `DATA-LICENSES.md` and its notice in `src/lib/data-release/catalog.ts`.
3. Rebuild the fixture: `pnpm fixture:bible` or `pnpm fixture:study`.
4. Name a new data release in `DATA_RELEASE` (`data-v2` after `data-v1`).
5. Run `pnpm import:bible` or `pnpm import:study` so the cache holds the new file, then `pnpm data:release`, and `pnpm data:release --publish` once the pull request is approved. The new release holds every pinned file, changed or not.
6. Merge, and release that version of Selah. Installs that upgrade load the changed source again at their next start; older versions keep using the older data release.

## Reader

`/read` is the reader: type a reference in the box (`John 3:16-21`, `jn3.16`, `Ps 23`, `John 3:16-18, 22; 4:1-3`) and read the passage with verse numbers, headings, footnotes, paragraphs and red-letter text.
Every passage has its own URL, and the `t` parameter picks the translations: one for the plain reader, two to four for the parallel view, where each verse is a row so the translations stay aligned.

| URL | Shows |
| :--- | :--- |
| `/read/john-3.16-21` | John 3:16-21 in the site's default translation |
| `/read/psalm-23?t=web` | Psalm 23 in the WEB |
| `/read/john-3.16-21?t=bsb,web,kjv` | Three translations side by side |
| `/read/john-3?v=john-3.16` | John 3 with verse 16 selected and the study panel open on it |
| `/read/john-3.16-21?ask=1` | John 3:16-21 with the [Ask](#ask) panel open, for the owner of an install that has it |
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

## Reflections, notes and sharing

Everything the owner makes is an item: a highlight, a reflection or a note. All three have a visibility (private, unlisted, public), tags, and their passages in `item_passage`.
Public items are on the [public site](#public-site); unlisted ones only at their permalink; private ones are the owner's alone.

- **Write**: "New post" in the owner bar, on every page, opens the editor at `/write`; "New note" opens it as a note (`/write?kind=note`). Nothing is made until something is written; the first save makes the item and the address becomes `/items/<id>/edit`.
- **Share a highlight**: "Share", beside "Edit" on its card, makes it public; "Unshare" and "Make unlisted" are there afterwards.
- **Reflect**: select verses in the reader and choose "Reflect". A draft opens in the editor with the passage in it.
- **Note**: "Note" in the reader opens the editor's note form on the selected verses, and comes back to them once posted; "Quick note" on `/items` opens one on no passage. A note's "Post" makes it public unless you choose unlisted; until then it is a private draft.
- **My items** (`/items`): every item of every kind, drafts included, as the feed will show it, with its visibility. Search it by words (title, text and note), passage (an item on any verse of the passage counts, so `Psalm 61:2-4` finds a highlight on 61:1-2), tag, kind, color and visibility, together or apart. With embeddings, a search also finds posts close in meaning; "These words only" turns that off. "My content" in the editor's study sidebar is the same search (`searchItems` in `src/lib/items/search.ts`).

![The editor, with the study sidebar open](docs/screenshots/post-editor.png)

**The editor** is the page: the title and the text in one column, written as rich text (no Markdown on screen). Format with Markdown shortcuts as you type (`## `, `> `, `- `, `1. `, `**bold**`, `*italic*`, `---`) or with the toolbar over selected text (bold, italic, link, heading, subheading, quote). Type `/` on a line, or click the "+" beside an empty one, for headings, lists, quotes, separators, images (by address) and passages; `/john 3:16` or `/ps 23 kjv` inserts that passage. "Publish" (a note's "Post") says who may see it; tags and "Delete" are under the settings button. The owner bar steps aside while the editor is open.

A **passage** in a post is a block that prints the verses as readers see them, with the translation and its attribution. Hover it (on a phone it always shows) to change its translation, move it up or down, drag it, or remove it; it is undone and redone whole.

The **study sidebar** (the "Study" button; it stays open or closed in this browser) has:

- **Read**: any reference the reader takes, in any translation; click a verse to select it, Shift-click to select through to another, Ctrl/Cmd-click to add or remove one, then "Insert" puts the selection (or the whole passage) where the cursor is. Previous and next chapter below.
- **Search**: keyword search of the Bible in the sidebar's translation; each verse can be inserted or read in context.
- **My content**: your highlights, notes and reflections, newest first, narrowed by words, tag and passage. A highlight goes in as its passage; a note or a reflection as a link to it (`/items/<id>`).

On a phone the sidebar is a sheet over the post, and closes once something is inserted.

**Passage cards.** A reflection is stored as Markdown, and a passage in it as a card: its reference in double brackets on a line of its own. The editor writes and reads these for you; anything written by hand opens in the editor as the same blocks.

```markdown
[[John 3:16-18]]
[[Romans 8:28-30 | KJV]]
```

The reference is anything the reader's box takes. The translation is the abbreviation or id of a loaded one; without it the card is in the site's default translation. The line must start at the margin; inside a fenced code block it is code. The card prints the verses (the first 1,500 characters or so of a long passage) with the reference, the translation and its attribution, and `item_passage` is rewritten from the cards on every save.

**Saving** happens as you type: 0.8 seconds after the last keystroke, when a field loses focus, and on Ctrl/Cmd+S, one save at a time. Until the server has a change it is also kept in the browser's `localStorage`, so a reload in between loses nothing. `src/lib/items/editor-document.ts` converts the editor's document to the stored Markdown and back with the same CommonMark parser as the public pages; the round trip is exact for everything the editor makes.

**Markdown** is CommonMark, rendered by [micromark](https://github.com/micromark/micromark) with its safe defaults: HTML in the Markdown is printed as text, and links and images with a `javascript:` or `data:` address lose the address.

**Tags** are typed separated by commas. A tag keeps the name it was first typed with ("Holy Spirit") and is identified by a slug (`holy-spirit`: lower case, accents dropped, anything but letters and digits made a hyphen). Up to 10 on an item, 40 characters each; a tag that is on nothing is deleted.

**Publishing.** `visibility` and `published_at` are written together, and the table has a check on it: an item is private exactly when `published_at` is null. Publishing sets the date once; switching between public and unlisted keeps it; unpublishing clears it.

The pieces, for anyone building on them:

- `src/lib/items/queries.ts`: `createItem`, `updateItem`, `saveItemContent`, `setVisibility`, `deleteItem`, `getItem`, `listItems` (filters: kind, color, tag, passage, dates), `itemsOnPassage`, `itemTags`, `listTags`, `taggedWith`. Every one takes the owner's id; pages for visitors read items through `src/lib/items/public.ts` instead (see [Public site](#public-site)).
- `src/lib/items/cards.ts`: the card syntax. `parseDocument(markdown)`, `documentPassages(markdown, translations)`, `passageCard(ranges, translation?)`.
- `src/lib/items/markdown.ts`: `renderMarkdown(markdown)` and `markdownExcerpt(markdown, limit?)`.
- `src/lib/items/tags.ts`: `parseTags`, `normalizeTag`, `tagSlug`, `formatTags`.
- `src/lib/items/feed.ts` and `src/components/items/feed-item.tsx`: `loadFeedEntries(db, items, { translations, defaultId })` reads the verses for a list of items, and `<FeedItem entry>` renders one of any kind. `<PassageCard>` is the card alone.
- `src/lib/items/editor-document.ts`: `markdownToDoc(markdown, { passages? })` and `docToMarkdown(doc)`, the editor's document to and from the stored Markdown.
- `src/components/editor/`: the editor. `post-editor.tsx` is the page; `passage-node.tsx` the passage block, with the command `editor.commands.insertPassage({ reference, translation })` that puts one where the cursor is; `study-sidebar.tsx` the sidebar, whose tabs are the entries of `STUDY_TABS` (a panel gets a `bridge` with `insertPassage(reference, translation)`, `insertLink(text, href)` and `read(reference)`). The sidebar's data comes from `src/app/api/editor/` (`passage`, `search`, `items`), owner only.
- `src/lib/items-url.ts`: `writePath({ kind, v, tr, back })` for the editor, `itemLinkPath(id)` for a link to an item.

## Public site

What a visitor sees, with no account: the writer's items in one calm column of serif type, set in [Source Serif 4](https://github.com/adobe-fonts/source-serif) (served by the site itself), good on a phone.

| Address | What it is |
| :--- | :--- |
| `/` | The feed: public items of every kind, newest first, ten to a page (`/?page=2`). The signed-in owner also gets "New post". |
| `/p/<slug>-<key>` | One item's permalink, e.g. `/p/no-condemnation-3f9a2c1b7d4e` or `/p/romans-8-38-39-c790edf191bc`. |
| `/tag/<slug>` | The public items with a tag. |
| `/passage/<reference>` | The passage in the default translation, then every public item on verses that overlap it: `/passage/romans-8` lists an item on Romans 8:28 and one on Romans 7:24-8:2. Any reference the reader takes works (`/passage/rom-8`, `/passage/john-3-16-21`) and redirects to the reader's spelling. |
| `/rss.xml`, `/atom.xml` | RSS 2.0 and Atom feeds of the latest 20 public items, with their full content, verses and attributions. Every tag and passage page has its own: `/tag/grace/rss.xml`, `/passage/romans-8/atom.xml`. |
| `/sitemap.xml`, `/robots.txt` | For search engines: the public items, tags and passages. |
| `/items/<id>` | How a post links to another item (the editor's "My content"). A visitor is sent on to the item's permalink while it is public or unlisted; the owner goes to the item itself. |

**Permalinks.** The key is the first twelve hex digits of the item's id, so it never changes; the slug before it is for people (a reflection's title, a note's first words, a highlight's reference). A permalink with an old slug, or with the key alone, redirects to the current one.

**Who sees what.** Public items are listed everywhere above. Unlisted items open at their permalink, carry `noindex`, and are in no list, feed or sitemap. Private items are not found for anyone but the owner, who sees them at their permalink marked private. The owner's own queries in `src/lib/items/queries.ts` never serve these pages; `src/lib/items/public.ts` does, with the condition on `visibility` in one place (`listed()`, `reachable()`).

**Sharing.** Every public page has Open Graph and Twitter card tags and an image beside it (`/p/<key>/og.png`, `/passage/romans-8/og.png`, `/tag/grace/og.png`, `/og.png`). A shared highlight previews as the verse, with its reference, translation and color; a reflection as its title and first words. The images are drawn on the server from the font files in `src/fonts`, with no request anywhere else: characters the font does not have (emoji, scripts other than Latin, Greek and Cyrillic) are left out of the image rather than fetched. Absolute URLs use `SELAH_URL` when it is set, otherwise the address the request came to.

**Passages.** A passage in an item is laid out as the reader lays it out, with its paragraphs, lines of poetry and red letters (`layoutPassage`, `<PassageQuote>`), on the page and in the feeds, where red letters carry an inline color for readers that drop classes. Descriptions and Open Graph images run the verses together on one line.

**Attribution.** Every passage on a page, in a feed entry or in a card credits its translation, and the footer of every public page lists each data source with its license.

The pieces: `src/lib/public-url.ts` (the addresses, `permalinkPath`, `itemLinkTarget`, `itemHeadline`, `parsePassage`), `src/lib/items/public.ts` (`listPublicItems`, `findByKey`, `findReachable`, `publicTag`, `publicTags`), `src/lib/public-feed.ts` (entries, feeds, OG cards), `src/lib/syndication.ts` (RSS and Atom), `src/lib/og/` (images), `src/components/site/` and `src/app/(site)/` (the theme and its pages).

## Owner account and settings

For anyone building on them:

- **Who is signed in**: `src/lib/auth/owner.ts`. `getOwner()` returns `{ id, email }` or `null`; `requireOwner(next?)` returns the owner or redirects to `/sign-in` (and back to `next` afterwards). Call `requireOwner()` at the top of every owner-only page and of every server action that changes something; a page's check does not protect the actions it renders. In a route handler, call `getOwner()` and answer 401 yourself. Nothing else should read the session; the Auth.js configuration is `src/auth.ts`.
- **Until there is an owner**, `src/proxy.ts` sends every page to `/setup`. That is all it does; it is not an access check.
- **Site settings**: `getSite()` in `src/lib/site.ts` returns the one `site` row (`title`, `handle`, `defaultTranslationId`, `settings`), read once per request. `settings` is typed by `SiteSettings` in `src/lib/site-settings.ts`; add new settings there.
- **AI keys**: `getAiKeys()` in `src/lib/ai/keys.ts` returns `{ anthropic?, voyage? }`, from the environment or the encrypted settings. Server-only: never pass a key to a client component or return it from a server action. Application code rarely needs them: `loadAiProvider()` in `src/lib/ai/load.ts` gives the install's provider.
- **Email**: `getMailer()` in `src/lib/email` (undefined when no SMTP is configured). With `EMAIL_TRANSPORT=stub` it writes each message to `<data dir>/outbox/` and sends nothing; tests use that.
- **First boot**: the ordered list is `firstBootSteps` in `scripts/first-boot-steps.ts`. Append new imports there, one `importStep({ id, title, version, what, load })` each: `version` is what the step loads (its pinned checksums; a done step runs again only when it changes) and `load` must be idempotent. Steps are independent: a failed one is recorded with a message and the rest still run. Downloads go through `download(urls)` in `src/lib/bible/import/download.ts`, which tries a list of URLs in order, so a mirror is a second URL. Progress is kept in the `boot_step` table; the runner is `src/lib/first-boot/runner.ts`.
- **Tests**: `pnpm e2e` runs two servers from one build. The fixture server has the seeded fixture and a test owner; a spec that needs the owner signed in says `test.use({ storageState: OWNER_STATE })` (from `e2e/owner.ts`), and is a signed-out visitor otherwise. Journey 1 runs against a second server and a database with no owner, recreated for each run (`e2e/fresh-install/`, `scripts/e2e-fresh-install.ts`). Tests on the fixture server run in parallel and share the site settings, so they must not change the title or the default translation. A journey that needs a low Ask cap sends the `x-selah-test-cap` header, which only the stub provider honours.

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

With embeddings there is also [search by meaning](#meaning-search): a "Search by" choice of Keyword, Meaning or Both, which is the default (`mode=keyword` or `mode=meaning` in the URL). Without them the page is exactly the keyword search, and says nothing about it.

The pieces:

- `src/db/schema.ts`: `verse.search`, a generated `tsvector` column with a GIN index (migration `0003_verse_search`).
- `src/lib/bible/search.ts`: `searchVerses(db, request)`, the one function that retrieves and ranks. It returns hits with their text cut into matched and unmatched segments.
- `src/lib/search-url.ts`: the URL parameters, and `interpretQuery()`, which tells a reference from words to search for.
- `src/app/search/page.tsx` and `src/components/search/`: the page, its filters and the result list.

Limits: words too common to index ("the", "of") are ignored, and inside a quoted phrase such a word stands for any one word. Stemming is modern English, so in the KJV `love` does not find "loveth".

## Meaning search

With a Voyage AI key, Selah finds passages by what they are about ("verses about anxiety"), suggests related passages in the reader's study panel and the editor's sidebar, and finds your own posts by meaning. All of it is optional: with no key, search is keyword search, related passages are cross references, and nothing on any page mentions it.

**Turning it on.** Add a key in Settings (or set `VOYAGE_API_KEY`), then press "Start" under "Meaning search". Progress shows there, and "Continue" picks up after a failure. With a key already there when Selah starts, the run starts by itself and resumes after a restart. From a terminal: `pnpm embed:bible` (with Docker, the app does this for you).

**What it costs.** Vectors are computed on your install and are never committed or mirrored.

| | BSB + WEB |
| :--- | ---: |
| Windows | 29,322 (14,656 + 14,666) |
| Text | 14.6 million characters, about 4 million tokens |
| One full run with `voyage-4` | About $0.25 at $0.06 per million tokens, and inside Voyage's 200 million free tokens |
| Space in Postgres | About 390 MB (157 MB of vectors, 230 MB of index) |
| Time | An estimate, not yet measured against Voyage: minutes, with a payment method on the account. Without one, expect lower limits; the run slows itself to match, and may stop and need "Continue" |

A search costs one short query, and is free when it repeats one recently asked. At most 60 new searches a minute go to Voyage; past that a search is by keyword until the minute is up, so a crawler on the public `/search` cannot run up a bill.

**How it works.**

- **Windows** (`src/lib/embeddings/windows.ts`): four verses, starting every second verse, so each verse is in two windows and a thought across a window's edge is whole in the next. A window never leaves its chapter, so it never crosses a book. A chapter's last window stops at its end, and a chapter shorter than a window is one window. Line breaks are spaces. A window knows its first and last verse, so a match opens in the reader as a passage.
- **Translations**: the BSB, the WEB, and the site's default translation when it is another one. `pnpm embed:bible kjv` adds any other. A translation without vectors is searched by keyword; related passages compare in another translation's vectors and quote the one being read.
- **Model**: `voyage-4` at 1024 dimensions, pinned as `VOYAGE_EMBEDDING_MODEL` in `src/lib/ai/voyage.ts`. Every vector is stored with its model's name, and only vectors of the model in use are read, so changing the name means embedding again. A window whose text changes is embedded again; one that no longer exists is removed.
- **Storage**: `passage_embedding` (pgvector, with an HNSW cosine index) and `item_embedding` (one owner's items are few enough to compare without an index). A filtered search uses pgvector's iterative scan, so a book or a testament still gets a full list.
- **Fusion** (`src/lib/embeddings/fusion.ts`): "Both" fuses the 200 best keyword verses and the 100 nearest windows by reciprocal rank fusion, with k = 60. A verse inside a window counts for the window, which then shows with the words marked, so it is not listed twice; of windows that overlap, the best stands for them. A word in more verses than that shows the best of them, with a link to all of them under Keyword.
- **Related** (`relatedPassages` in `src/lib/embeddings/related.ts`): the windows nearest to the average of the passage's own, leaving out the passage and the verses right around it, blended with its cross references the same way. Without vectors it is the cross references alone; the reader's panel then shows no "Related" section, since they are listed just above it.
- **Your items**: reflections and notes with text are embedded a few seconds after you stop typing (a highlight is the Bible's words, and its note is found by keyword). Passage cards are left out. A save never waits for this and never fails because of it: with no key or with Voyage down, the post is found by its words, and the next save, or the next run, embeds it.
- **When Voyage fails**: requests are paced, and back off and retry on a rate limit or a server error. A search that cannot be embedded is a keyword search. A run that fails says so in Settings, and what it finished is kept.

**Not calibrated yet.** The similarity below which a passage counts as no match (`MIN_SIMILARITY` in `src/lib/ai/voyage.ts`) is a judgement, not a measurement. It decides where a list stops, not its order.

## Ask

With an Anthropic key, the owner can ask about the passage open in the reader, or in the editor's study sidebar while writing. Answers come from Claude (`claude-sonnet-5-5`, with no fallback to another model), grounded in the passage and its study sources, with what the text says kept apart from how people have read it. Without a key nothing here exists: no link, no tab, no line on any page but Settings.

**Turning it on.** Paste an Anthropic API key under "AI keys" in Settings, or set `ANTHROPIC_API_KEY`, which wins over a saved key. "Test the key" makes one very small call. `AI_PROVIDER=none` keeps Ask off whatever keys there are. Ask does not need a Voyage key; with one, it also reads passages found by meaning, and without one it uses keyword matches.

**Who can use it.** Only the signed-in owner, checked on every call to the API. A question spends the owner's key, and the public site is for visitors, so there is no public Ask.

**In the reader.** "Ask about this passage" opens a panel on the passage, or on the selected verses; the study panel has an Ask tab too. A conversation of up to six questions stays in that browser tab, per passage and translation. The server keeps none of it beyond the saved answers.

**In the editor.** The study sidebar's Ask tab opens on the last passage in the post, or the one open in Read, or any you type.

- "Suggest related passages" lists passages by meaning, cross reference and shared words, and "What do commentators say" lists a short excerpt from each commentator, word for word. Neither calls Claude or counts toward the cap.
- Each suggestion, cited passage and quote has its own Insert button. Nothing goes into a post without that click, and an answer's own words have no way in at all: AI never writes the reflection.

**An answer.** It has two sections, "What the text says" and "Interpretation", followed by its sources. Citations are links into the reader. A commentator is named with their tradition, as in "Matthew Henry (English Puritan tradition) writes…".

- A citation is linked only if its verses were in what Claude was given. One that was not is removed, and the answer says so.
- A quote is shown only if its words are in the entry it names, and the name, tradition, attribution and license beside it come from the database, not from Claude.
- The contract, including the tone rules, is in [docs/ask.md](docs/ask.md).

**Tone.** Claude is told to separate text from interpretation, to take no denominational position beyond the sources it cites, to give more than one reading where they differ, not to present pastoral advice as scripture, and to say when the text is silent.

**What is sent to Anthropic.** The passage in the translation being read, its footnotes, excerpts of the commentaries and of the Tyndale Open Study Notes on it, the verses of its cross references, any related passages, the question, and the earlier turns of that conversation. Nothing else: no highlights, notes, reflections, account details or site settings. Commentary entries are not sent whole: the context has a budget of about 8,000 tokens, and each answer lists what was left out.

**Cost.** A question sends at most about 8,500 tokens and gets back at most 8,000, thinking included, at Sonnet's $2 and $10 per million: about 10 cents at the very most, and usually far less. That ceiling comes from the limits in the code; real answers have not been measured.

- **Daily cap.** At most 50 questions a day reach Claude, which Settings can change. The day is UTC. A saved answer does not count, "Ask again" does, and a question that fails before any answer comes back is given back.
- **Saved answers.** An answer is saved by passage, translation, question and model, and a repeat is shown at once, marked "Saved answer". "Clear saved answers" in Settings empties them. Answers cut short or missing a section are not saved.

**Tyndale Open Study Notes and share-alike.** Ask reads the notes, so their text is sent to Anthropic as context and can be quoted in answers, cards and saved answers. They are under CC BY-SA 4.0, so Claude is told to quote them and not rewrite them, and every quote carries its attribution and a license link, added by the app from the source's id. Wherever words are left out of a quote, it shows `[…]`.

When you insert a note into a post, it goes in as a blockquote with its credit and license inside the quote. That quoted part stays under CC BY-SA 4.0, and your own writing around it stays yours: the quote block says so, and every public page and feed entry of the post prints a notice. If you rework a note's words into your own text rather than quoting them, that reworked text is an adaptation, and CC BY-SA 4.0 applies to it.

**Tests use canned answers.** With `AI_PROVIDER=stub`, which the tests and `pnpm e2e:serve` use, answers are canned: the stub repeats retrieved verses and the first words of commentary, in the right shape, with no network. They show that the machinery works and say nothing about the quality of a real answer.

The pieces, for anyone building on them:

- `src/lib/ai/claude.ts`: the Messages API over `fetch`, with the pinned model names. `getAiProvider()` composes it with Voyage.
- `src/lib/ask/sources.ts`: the sources Ask reads, one line each, with each one's tradition. Adding a source to this table is all it takes for retrieval to read it.
- `src/lib/ask/context.ts`: `buildContext`. `prompt.ts`: what Claude is told. `answer.ts`: parsing and validating what comes back. `quote.ts`: quotes and their credits. `store.ts`: the cache and the cap.
- `src/lib/items/share-alike.ts`: finds a share-alike quote in stored Markdown, for the public notice.

## Export

"Export everything" on `/items` and in Settings downloads a zip of all you have made (`/export`, owner only). It streams, so a long history needs no more memory than a short one.

```text
selah-export-2026-10-30.zip
├── selah-export.json
└── items/
    ├── highlights/2026-10-13-psalm-61-1-2-3f9a2c1b7d4e.md
    ├── notes/2026-10-14-the-commandments-summed-up-a81c02d4e5f6.md
    └── reflections/2026-10-15-waiting-in-silence-c790edf191bc.md
```

**`selah-export.json`** is the record. Its format is versioned: fields may be added within a version, and any other change raises `version`.

| Field | Meaning |
| :--- | :--- |
| `schema` | Always `"selah-export"` |
| `version` | `1` |
| `exportedAt` | When, in ISO 8601 |
| `site` | `title`, `handle`, `defaultTranslation` |
| `items[]` | Every item, oldest first |

Each item has `id`, `kind` (`highlight`, `reflection` or `note`), `title`, `markdown`, `note`, `color`, `visibility`, `publishedAt`, `createdAt`, `updatedAt`, `tags` (`slug` and `name`), `passages` (`reference`, `verseStart`, `verseEnd`, `translation`) and `permalink` (a path on the site, `null` while private). `markdown` is exactly as stored, with passage cards as `[[Reference | T]]` lines. Verse ids are `BBCCCVVV`. The types are in `src/lib/export/format.ts`.

**The Markdown files** are for reading anywhere. Each has YAML front matter (`id`, `kind`, `title`, `visibility`, dates, and `color`, `tags`, `passages` and `permalink` where it has them), then the body. A passage card is written out as a blockquote, with verse numbers, poetry's line breaks, and the reference and the translation's attribution on the last line. The `[[...]]` syntax is not in these files; it is in the JSON. A card whose reference could not be read stays as it was typed.

No secrets are exported: of the site, only the three fields above, named one by one. API keys, password hashes, the owner's email and sessions are not in the file. The translations' own text appears only as your posts quote it.

There is no import yet.

## License

Code: [MIT](LICENSE).
Bible texts, cross references and commentaries keep their own licenses; each source, its license and its attribution are listed in [DATA-LICENSES.md](DATA-LICENSES.md).
