import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { editorProps } from "@/app/write/editor-props";
import { PostEditor } from "@/components/editor/post-editor";
import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { editItemPath } from "@/lib/items-url";
import { getItem } from "@/lib/items/queries";

type Props = PageProps<"/items/[id]/edit">;

export const metadata: Metadata = { title: "Edit", robots: { index: false } };

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// The editor of a reflection or a note (src/components/editor/post-editor.tsx).
// A highlight has no page here: it is edited where it is, in the reader.
export default async function EditItemPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const owner = await requireOwner(editItemPath(id));

  const db = getDb();
  const item = await getItem(db, { ownerId: owner.id, id });
  if (!item || item.kind === "highlight") notFound();

  // Keyed by the item: another item's editor starts afresh.
  return <PostEditor key={item.id} {...await editorProps(db, { item, kind: item.kind })} />;
}
