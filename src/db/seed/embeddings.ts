import { createStubProvider } from "@/lib/ai/stub";
import { embedPassages } from "@/lib/embeddings/passages";

import type { SeedStep } from "./fixture";

// The fixture's verse windows as stub vectors, whatever provider the app runs
// with: the journeys' meaning search needs something to find. The KJV is left
// out on purpose, as it is on a real install, so a search in it is a keyword
// search even with a provider on.
export const embeddingsFixtureStep: SeedStep = {
  name: "Embeddings fixture (stub vectors for BSB, WEB)",
  run: async (db) => {
    await embedPassages(db, createStubProvider(), ["bsb", "web"]);
  },
};
