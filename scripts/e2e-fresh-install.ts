import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

import postgres from "postgres";

import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { bibleFixtureStep } from "../src/db/seed/bible";
import { databaseUrl } from "../src/lib/env";
import { loadEnv } from "./load-env";

// Journey 1 (install and set up) needs what the other journeys must not
// have: a database with no owner. It gets its own database and its own app
// server, beside the fixture ones:
//
//   tsx scripts/e2e-fresh-install.ts reset   recreate the database: migrated,
//                                            Bible fixture loaded, no owner
//   tsx scripts/e2e-fresh-install.ts serve   reset, then serve the built app
//                                            against it on E2E_PORT + 1
//
// playwright.config.ts runs both; see e2e/fresh-install/.

loadEnv();

const mainPort = Number(process.env.E2E_PORT || 3000);
const port = mainPort + 1;
const FRESH_DATA_DIR = ".data/e2e-fresh-install";

// The fixture database's neighbour, e.g. selah -> selah_fresh_install.
function freshUrl(): { url: string; name: string } {
  const url = new URL(databaseUrl());
  const name = `${url.pathname.slice(1)}_fresh_install`;
  url.pathname = `/${name}`;
  return { url: url.toString(), name };
}

async function reset(): Promise<void> {
  const { url, name } = freshUrl();
  const admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  try {
    // FORCE: the fresh-install server may be holding connections from a previous run.
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const { db, client } = createDb(url, { max: 1 });
  try {
    await runMigrations(db);
    await bibleFixtureStep.run(db);
  } finally {
    await client.end();
  }
  // A new install has no secret, no setup token and no sent email either.
  rmSync(FRESH_DATA_DIR, { recursive: true, force: true });
  console.log(`e2e: ${name} is a fresh install (Bible fixture loaded, no owner)`);
}

// The fixture server builds the app before it listens, so once it answers
// there is a build to serve.
async function waitForBuild(timeoutMs = 170_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(`http://127.0.0.1:${mainPort}/api/health`);
      return;
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`No server on port ${mainPort}; start it with \`pnpm e2e:serve\`.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const command = process.argv[2];
if (command === "reset") {
  await reset();
} else if (command === "serve") {
  await waitForBuild();
  await reset();
  const server = spawn(
    "pnpm",
    ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: freshUrl().url,
        SELAH_DATA_DIR: FRESH_DATA_DIR,
        SELAH_URL: `http://127.0.0.1:${port}`,
        // Magic links are tested here; the stub writes them to a file.
        EMAIL_TRANSPORT: "stub",
        // An install with AI off: no embeddings, and the key saved in journey 1
        // is never used. Keyword search is what is left, and all that is said.
        AI_PROVIDER: "none",
      },
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.kill(signal));
  server.on("exit", (code) => process.exit(code ?? 0));
} else {
  throw new Error('Usage: tsx scripts/e2e-fresh-install.ts <"reset" | "serve">');
}
