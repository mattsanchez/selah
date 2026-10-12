import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { getAiProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Reports whether the app can reach its database and which AI provider is active.
export async function GET() {
  const provider = getAiProvider();
  const ai = { provider: provider.name, enabled: provider.enabled };

  try {
    const rows = await getDb().execute<{ extversion: string }>(
      sql`select extversion from pg_extension where extname = 'vector'`,
    );
    const pgvector = rows[0]?.extversion ?? null;
    const ok = pgvector !== null;
    return Response.json(
      { ok, db: { ok: true, pgvector }, ai },
      { status: ok ? 200 : 503 },
    );
  } catch {
    return Response.json(
      { ok: false, db: { ok: false, pgvector: null }, ai },
      { status: 503 },
    );
  }
}
