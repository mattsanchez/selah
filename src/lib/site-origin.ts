import { headers } from "next/headers";

import { publicUrl } from "@/lib/env";

// The site's own address, for what must carry absolute URLs: feeds, the
// sitemap, Open Graph tags. SELAH_URL when it is set; otherwise the host the
// request came to, as a reverse proxy passes it on (see "Putting it on the
// internet" in the README).

type Headers = { get(name: string): string | null };

// A host and an optional port; anything else is not used.
const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$|^\[[0-9a-f:.]+\](?::\d{1,5})?$/i;

export function originFrom(request: Headers, fixed: string | undefined = publicUrl()): string {
  if (fixed) return fixed;
  const first = (name: string) => request.get(name)?.split(",")[0].trim() || undefined;
  const host = [first("x-forwarded-host"), first("host")].find((value) => value && HOST.test(value));
  const proto = first("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${(host ?? "localhost").toLowerCase()}`;
}

// For pages, metadata and route handlers.
export async function siteOrigin(): Promise<string> {
  return originFrom(await headers());
}
