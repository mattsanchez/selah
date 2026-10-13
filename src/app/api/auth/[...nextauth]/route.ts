import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { publicUrl } from "@/lib/env";

// Auth.js works out where it lives from the request's URL, which inside a
// container is whatever the server was told to listen on. When the site has a
// public address (SELAH_URL), requests are presented to it as made to that
// address, so the redirects it issues are for the real site.
//
// A plain Request, not a NextRequest: NextRequest rewrites loopback addresses
// to "localhost", which would undo this for http://127.0.0.1.
function atPublicAddress(request: NextRequest): NextRequest {
  const origin = publicUrl();
  if (!origin) return request;
  const { pathname, search } = new URL(request.url);
  return new Request(new URL(pathname + search, origin), request) as NextRequest;
}

export const GET = (request: NextRequest) => handlers.GET(atPublicAddress(request));
export const POST = (request: NextRequest) => handlers.POST(atPublicAddress(request));
