import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // No test asks Selah's real mirror for a file: the ones about the mirror
    // name one of their own.
    env: { SELAH_DATA_MIRROR: "off" },
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
