import { runMigrations } from "../src/db/migrate";
import { seedFixture } from "../src/db/seed/fixture";
import { connect } from "./db-connect";

// Migrates the database, then loads the fixture the Playwright journeys run against.
const { db, client } = await connect();
try {
  await runMigrations(db);
  console.log("migrate: database is up to date");
  await seedFixture(db);
} finally {
  await client.end();
}
