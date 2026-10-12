import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { Db } from "./client";

// Applies every pending migration in ./drizzle. Run from the repo root.
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
