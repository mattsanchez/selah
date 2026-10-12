import { existsSync } from "node:fs";

// Loads .env for CLI scripts the way Next.js does for the app: variables
// already set in the environment win.
export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
