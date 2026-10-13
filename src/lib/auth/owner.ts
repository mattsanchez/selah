import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { findOwner, type Owner } from "@/lib/owner";

export type { Owner };

// Who is signed in. Everything that needs the owner goes through these two
// functions; nothing else reads the session.

// The signed-in owner, or null. Checked against the database on every
// request (once per request), so a session stops working as soon as its
// account is gone or its password has been reset.
export const getOwner = cache(async (): Promise<Owner | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const owner = await findOwner(getDb());
  if (!owner || owner.id !== id) return null;
  const { sessionVersion } = session as { sessionVersion?: unknown };
  if (sessionVersion !== owner.sessionVersion) return null;
  return { id: owner.id, email: owner.email };
});

// Only a path on this site, so a crafted link cannot send someone elsewhere
// after they sign in.
export function safeNextPath(next: string | undefined | null, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

export function signInPath(next?: string): string {
  const path = safeNextPath(next, "");
  return path ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in";
}

// For a page, layout or server action only the owner may use: returns the
// owner, or sends the visitor to the sign-in page (and back to `next` after).
// Call it at the top of every server action that changes anything; a page's
// own check does not protect the actions it renders.
export async function requireOwner(next?: string): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect(signInPath(next));
  return owner;
}
