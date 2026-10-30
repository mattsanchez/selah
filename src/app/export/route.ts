import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { exportEntries, zipBytes } from "@/lib/export/archive";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

// The owner's everything, as a zip (see "Export" in the README). A visitor is
// sent to sign in. It streams: the response starts before the items are read.
export async function GET() {
  const owner = await requireOwner("/export");
  const site = await getSite();
  if (!site) return new Response("This site is not set up yet.", { status: 503 });

  const now = new Date();
  const bytes = zipBytes(exportEntries(getDb(), owner.id, site, now));
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await bytes.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await bytes.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="selah-export-${now.toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
