import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseUrl } from "@/lib/env";

import * as schema from "./schema";

export function createDb(
  url: string = databaseUrl(),
  options: postgres.Options<Record<string, never>> = {},
) {
  const client = postgres(url, { onnotice: () => {}, ...options });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];

// Cached on globalThis so dev-server reloads reuse one connection pool.
const globalForDb = globalThis as typeof globalThis & {
  selahDb?: ReturnType<typeof createDb>;
};

export function getDb(): Db {
  globalForDb.selahDb ??= createDb();
  return globalForDb.selahDb.db;
}
