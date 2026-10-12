import { runMigrations } from "../src/db/migrate";
import { connect } from "./db-connect";

const { db, client } = await connect();
try {
  await runMigrations(db);
  console.log("migrate: database is up to date");
} finally {
  await client.end();
}
