import { defineConfig, devices } from "@playwright/test";

// Two app servers, from one build:
//
// - the fixture server (E2E_PORT, default 3000): the seeded fixture plus the
//   test owner. Every journey but the first runs here, signed out unless it
//   asks for the owner's session (see e2e/owner.ts).
// - the fresh-install server (E2E_PORT + 1): its own database with no owner,
//   recreated before each run. Journey 1 runs here, alone and in order.
const port = Number(process.env.E2E_PORT || 3000);
const baseURL = `http://127.0.0.1:${port}`;
const freshInstallURL = `http://127.0.0.1:${port + 1}`;

const chrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Seeds the test owner and saves a signed-in browser state for the journeys.
    { name: "owner-session", testMatch: /owner\.setup\.ts$/, use: chrome },
    {
      name: "chromium",
      testIgnore: /fresh-install\//,
      dependencies: ["owner-session"],
      use: chrome,
    },
    // Puts the fresh-install database back to "no owner", then runs journey 1.
    { name: "fresh-install-reset", testMatch: /fresh-install\/reset\.setup\.ts$/ },
    {
      name: "fresh-install",
      testMatch: /fresh-install\/.*\.spec\.ts$/,
      dependencies: ["fresh-install-reset"],
      fullyParallel: false,
      // A retry would find the owner its first attempt created.
      retries: 0,
      use: { ...chrome, baseURL: freshInstallURL },
    },
  ],
  // Each reuses a server that is already running; otherwise starts one.
  webServer: [
    {
      command: "pnpm e2e:serve",
      url: `${baseURL}/api/health`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: "pnpm e2e:serve:fresh-install",
      url: `${freshInstallURL}/api/health`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
