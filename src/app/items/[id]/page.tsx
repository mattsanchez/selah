import { notFound, redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { getOwner } from "@/lib/auth/owner";
import { getItem } from "@/lib/items/queries";
import { findReachable } from "@/lib/items/public";
import { itemLinkTarget } from "@/lib/public-url";

type Props = PageProps<"/items/[id]">;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// An item as a post links to it (itemLinkPath in src/lib/items-url.ts). The
// owner is taken to it: a reflection or a note to its editor, a highlight to
// its verses. Anyone else is sent on to its permalink while it is public or
// unlisted, and finds nothing here while it is private (itemLinkTarget in
// src/lib/public-url.ts).
export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const owner = await getOwner();
  const mine = owner ? await getItem(db, { ownerId: owner.id, id }) : undefined;
  const item = mine ?? (await findReachable(db, id));
  const target = item && itemLinkTarget(item, { owner: mine !== undefined });
  if (!target) notFound();
  redirect(target);
}
