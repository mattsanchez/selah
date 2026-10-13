import { runMigrations } from "../src/db/migrate";
import { runFirstBoot } from "../src/lib/first-boot/runner";
import { bootStepStore } from "../src/lib/first-boot/store";
import { connect } from "./db-connect";
import { firstBootSteps } from "./first-boot-steps";

// Does what a Docker install does on first boot, without starting the app:
// applies migrations, then runs the first-boot steps (the full Bible import).
// Safe to re-run; steps already done are skipped.
const { db, client } = await connect(60_000, { max: 3 });
try {
  await runMigrations(db);
  console.log("migrate: database is up to date");
  const result = await runFirstBoot(firstBootSteps(db), bootStepStore(db));
  if (result.failed.length > 0) process.exitCode = 1;
} finally {
  await client.end();
}
