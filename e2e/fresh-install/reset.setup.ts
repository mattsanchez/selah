import { execFileSync } from "node:child_process";

import { test as setup } from "@playwright/test";

// Journey 1 creates the owner, so each run has to start from a database
// without one, even when the fresh-install server is still up from the last run.
setup("recreate the fresh-install database", () => {
  execFileSync("pnpm", ["exec", "tsx", "scripts/e2e-fresh-install.ts", "reset"], {
    stdio: "inherit",
  });
});
