import { defineConfig } from "drizzle-kit";

import { loadEnv } from "./scripts/load-env";
import { databaseUrl } from "./src/lib/env";

loadEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl() },
});
