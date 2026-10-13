import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { getAiProvider } from "@/lib/ai";
import { getFirstBootStatus } from "@/lib/first-boot/store";
import { ownerExists } from "@/lib/owner";

export const dynamic = "force-dynamic";

// Reports whether the app can reach its database, which AI provider is
// active, whether the owner account exists and how first boot is going.
export async function GET() {
  const provider = getAiProvider();
  const ai = { provider: provider.name, enabled: provider.enabled };

  try {
    const rows = await getDb().execute<{ extversion: string }>(
      sql`select extversion from pg_extension where extname = 'vector'`,
    );
    const pgvector = rows[0]?.extversion ?? null;
    const ok = pgvector !== null;
    const db = getDb();
    const firstBoot = await getFirstBootStatus(db);
    return Response.json(
      {
        ok,
        db: { ok: true, pgvector },
        ai,
        setup: { complete: await ownerExists(db) },
        firstBoot: {
          state: firstBoot.state,
          steps: firstBoot.steps.map(({ id, status }) => ({ id, status })),
        },
      },
      { status: ok ? 200 : 503 },
    );
  } catch {
    return Response.json(
      { ok: false, db: { ok: false, pgvector: null }, ai },
      { status: 503 },
    );
  }
}
