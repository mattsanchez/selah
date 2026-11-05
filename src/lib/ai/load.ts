import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { site } from "@/db/schema";

import { getAiProvider } from "./index";
import { aiKeysFrom, getAiKeys } from "./keys";
import { noneProvider } from "./none";
import type { AiProvider } from "./types";

// The install's provider, counting the keys saved in settings as well as
// those in the environment. A database that cannot be read, or a secret that
// does not open a key, is an install without AI, not a broken page. `db` is
// for scripts, which have their own connection; the app reads the site once
// per request through getAiKeys().
export async function loadAiProvider(env = process.env, db?: Db): Promise<AiProvider> {
  // Decided by AI_PROVIDER alone: an unknown name throws here, as it should.
  const set = env.AI_PROVIDER?.trim().toLowerCase();
  if (set && !["voyage", "claude", "claude+voyage"].includes(set)) return getAiProvider(env);
  try {
    if (!db) return getAiProvider(env, await getAiKeys());
    const [row] = await db.select({ settings: site.settings }).from(site).where(eq(site.id, 1));
    return getAiProvider(env, aiKeysFrom(row?.settings));
  } catch {
    return noneProvider;
  }
}
