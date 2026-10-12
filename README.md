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
| `pnpm e2e:serve` | Build and serve on 127.0.0.1:3000 against the seeded database with the AI provider stubbed |
| `pnpm e2e` | Playwright tests; reuses a running `pnpm e2e:serve`, or starts one |

Before the first `pnpm e2e`, install the browser with `pnpm exec playwright install chromium`.

Configuration is read from the environment, with defaults that match `docker-compose.yml`, so a fresh clone needs no `.env` file.
To change something, copy `.env.example` to `.env`.

AI and embeddings calls go through one provider module, `src/lib/ai`, selected by `AI_PROVIDER`.
Tests and `pnpm e2e:serve` use the `stub` provider, which is deterministic and never touches the network.

## License

Code: [MIT](LICENSE).
Bible texts, cross references and commentaries keep their own licenses; each source and its attribution will be listed in `DATA-LICENSES.md`.
