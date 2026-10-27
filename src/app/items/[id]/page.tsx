import { notFound, redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { getOwner } from "@/lib/auth/owner";
import { editItemPath } from "@/lib/items-url";
import { getItem } from "@/lib/items/queries";
import { readerPath } from "@/lib/reader-url";

type Props = PageProps<"/items/[id]">;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// An item as a post links to it (itemLinkPath in src/lib/items-url.ts). The
// owner is taken to it: a reflection or a note to its editor, a highlight to
// its verses. Anyone else finds nothing here yet; the public site (M9) can
// send them on to a published item's permalink.
export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const owner = await getOwner();
  if (!owner) notFound();
  const item = await getItem(getDb(), { ownerId: owner.id, id });
  if (!item) notFound();
  redirect(
    item.kind === "highlight" ? readerPath(item.passages, undefined, { v: item.passages }) : editItemPath(item.id),
  );
}
