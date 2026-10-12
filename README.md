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
It is safe to re-run: a second run reuses the cached files and changes nothing.

If it stops with a checksum mismatch, the upstream text has changed since it was pinned.
Review the change, update the pin, and run `pnpm fixture:bible` to rebuild the fixture from the new text.

Verses are keyed by a canonical id, `BBCCCVVV` (John 3:16 is `43003016`), shared by every translation; `src/lib/bible` has the helpers and explains how numbering differences between translations are handled.

## License

Code: [MIT](LICENSE).
Bible texts, cross references and commentaries keep their own licenses; each source, its license and its attribution are listed in [DATA-LICENSES.md](DATA-LICENSES.md).
