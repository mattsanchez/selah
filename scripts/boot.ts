import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

import { eq } from "drizzle-orm";

import { runMigrations } from "../src/db/migrate";
import { site } from "../src/db/schema";
import { loadAiProvider } from "../src/lib/ai/load";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";
import { runEmbeddingJob } from "../src/lib/embeddings/job";
import { publicUrl } from "../src/lib/env";
import { runFirstBoot } from "../src/lib/first-boot/runner";
import { bootStepStore } from "../src/lib/first-boot/store";
import { ownerExists, setOwnerPassword } from "../src/lib/owner";
import { authSecret, getSetupToken } from "../src/lib/secrets";
import { connect } from "./db-connect";
import { firstBootSteps } from "./first-boot-steps";

// The entry point of the Docker image (bundled to boot.mjs by `pnpm build:boot`).
//
//   node boot.mjs                  migrate, start the app, run the first-boot steps
//   node boot.mjs reset-password   set a new password for the owner
//
// The app is started as soon as the database is migrated, so the site is
// reachable, and shows progress, while the first-boot steps run or after one
// fails.

const log = (message: string) => console.log(message);

function setupNotice(): string {
  const origin = publicUrl() ?? `http://localhost:${process.env.SELAH_PORT || process.env.PORT || 3000}`;
  const token = getSetupToken();
  const line = "=".repeat(72);
  return [
    line,
    "Selah is not set up yet. To create the owner account, open:",
    "",
    `  ${origin}/setup?token=${token}`,
    "",
    `Setup token: ${token}`,
    "(The setup screen asks for it, so only someone who can read these logs",
    "can claim this install.)",
    line,
  ].join("\n");
}

async function serve(): Promise<void> {
  // Creates the secret now if there is none, so the app and this process
  // cannot race to create it, and a bad SELAH_SECRET stops the start here.
  authSecret();

  const { db, client } = await connect(120_000, { max: 3 });
  await runMigrations(db);
  log("boot: database is up to date");
  if (!(await ownerExists(db))) log(setupNotice());

  const server = spawn(process.execPath, ["server.js"], {
    stdio: "inherit",
    // The notice above already showed the token; the app need not repeat it.
    env: { ...process.env, SELAH_SETUP_TOKEN_SHOWN: "1" },
  });
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      stopping = true;
      server.kill(signal);
    });
  }
  const exited = new Promise<number>((resolve) => {
    server.on("exit", (code) => resolve(code ?? (stopping ? 0 : 1)));
  });

  try {
    const result = await runFirstBoot(firstBootSteps(db), bootStepStore(db), { log });
    log(
      result.failed.length === 0
        ? "boot: first boot is complete"
        : `boot: first boot finished with ${result.failed.length} failed step(s); ` +
            "the site shows what failed and how to retry",
    );
    // Printed again so it is the last thing in the logs after a long import.
    if (!stopping && !(await ownerExists(db))) log(setupNotice());

    // With a key already there, embed what is missing: resumes after a restart,
    // and costs nothing once it is done. Without one, this is the Settings page's.
    const provider = await loadAiProvider(process.env, db);
    if (!stopping && provider.embeddingModel) {
      const [row] = await db.select().from(site).where(eq(site.id, 1));
      const outcome = await runEmbeddingJob(db, provider, { defaultId: row?.defaultTranslationId });
      log(`boot: embeddings: ${outcome}`);
    }
  } catch (error) {
    // The app keeps serving; its status page reports the steps as stalled.
    console.error("boot: first boot stopped unexpectedly", error);
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
  process.exitCode = await exited;
}

async function resetPassword(): Promise<void> {
  const input = createInterface({ input: process.stdin, output: process.stderr });
  const password = await input.question("New password for the owner: ");
  input.close();
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters. Nothing was changed.`,
    );
  }
  const { db, client } = await connect(30_000);
  try {
    if (!(await setOwnerPassword(db, password))) {
      throw new Error("There is no owner yet. Open the site to set it up.");
    }
    log("The owner's password was changed, and every existing session was signed out.");
  } finally {
    await client.end();
  }
}

const command = process.argv[2];
try {
  if (command === undefined) await serve();
  else if (command === "reset-password") await resetPassword();
  else throw new Error(`Unknown command "${command}". Expected nothing or "reset-password".`);
} catch (error) {
  console.error(error instanceof Error ? `boot: ${error.message}` : error);
  if (error instanceof Error && error.cause) console.error(error.cause);
  process.exitCode = 1;
}
