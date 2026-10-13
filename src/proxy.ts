import { NextResponse, type NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { ownerExists } from "@/lib/owner";

// Until the owner account exists, every page leads to the setup screen.
// This is the only thing the proxy does: who may see what once the site is
// set up is decided by requireOwner (src/lib/auth/owner.ts), route by route.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/setup" || pathname === "/api/health") return NextResponse.next();

  try {
    if (await ownerExists(getDb())) return NextResponse.next();
  } catch {
    // The database is unreachable or not migrated; let the route report it.
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This site is not set up yet." }, { status: 503 });
  }
  const setup = request.nextUrl.clone();
  setup.pathname = "/setup";
  setup.search = "";
  return NextResponse.redirect(setup);
}

export const config = {
  // Everything except the build's static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
