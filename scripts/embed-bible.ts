import { eq } from "drizzle-orm";

import { site } from "../src/db/schema";
import { loadAiProvider } from "../src/lib/ai/load";
import { runEmbeddingJob } from "../src/lib/embeddings/job";
import { connect } from "./db-connect";

// Embeds the Bible's verse windows and any items still waiting, with the
// install's provider: `pnpm embed:bible`, or `pnpm embed:bible kjv` to name
// the translations. Safe to stop and run again: only windows without a vector
// are embedded. See "Meaning search" in the README for what it costs.
const { db, client } = await connect(60_000, { max: 3 });
try {
  const provider = await loadAiProvider(process.env, db);
  if (!provider.embeddingModel) {
    console.error(
      "embed: there is no Voyage AI key. Set VOYAGE_API_KEY, or save a key in Settings, and run this again.",
    );
    process.exitCode = 1;
  } else {
    const [row] = await db.select().from(site).where(eq(site.id, 1));
    const named = process.argv.slice(2).filter((arg) => arg !== "--");
    let shown = 0;
    const result = await runEmbeddingJob(db, provider, {
      defaultId: row?.defaultTranslationId,
      translationIds: named.length > 0 ? named : undefined,
      log: (message) => {
        // A line about every minute's worth of a long run, not one a batch.
        const now = Date.now();
        if (now - shown < 5_000 && /^\d+ of \d+ windows$/.test(message)) return;
        shown = now;
        console.log(`embed: ${message}`);
      },
    });
    if (result === "busy") console.error("embed: another run is working on this already.");
    if (result !== "done") process.exitCode = 1;
    else console.log(`embed: done, with ${provider.embeddingModel}`);
  }
} finally {
  await client.end();
}
