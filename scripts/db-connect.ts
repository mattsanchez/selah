import { sql } from "drizzle-orm";

import { createDb } from "../src/db/client";
import { loadEnv } from "./load-env";

// Opens a connection for a CLI script, waiting for Postgres to accept
// connections: `docker compose up -d db` returns before the server is ready.
export async function connect(timeoutMs = 60_000) {
  loadEnv();

  const connection = createDb(undefined, { max: 1 });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await connection.db.execute(sql`select 1`);
      return connection;
    } catch (error) {
      if (Date.now() >= deadline) {
        await connection.client.end({ timeout: 1 });
        throw new Error(
          "Could not reach Postgres. Is it running? Try `docker compose up -d db`.",
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
