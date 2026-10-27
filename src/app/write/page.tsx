import type { Metadata } from "next";

import { PostEditor } from "@/components/editor/post-editor";
import { getDb } from "@/db/client";
import { requireOwner, safeNextPath } from "@/lib/auth/owner";
import { writePath } from "@/lib/items-url";
import { parsePassages } from "@/lib/items/validate";

import { editorProps } from "./editor-props";

type Props = PageProps<"/write">;

export const metadata: Metadata = { title: "Write", robots: { index: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// A new post, in the editor (see src/lib/items-url.ts for the URLs). Nothing
// is made until something is written: the first save makes the item and
// moves the address to its editor, /items/<id>/edit.
export default async function WritePage({ searchParams }: Props) {
  const params = await searchParams;
  const kind = first(params.kind) === "note" ? "note" : "reflection";
  const v = first(params.v)?.trim() || undefined;
  const tr = first(params.tr)?.trim() || undefined;
  const back = safeNextPath(first(params.back), "") || undefined;
  await requireOwner(writePath({ kind, v, tr, back }));

  const ranges = kind === "note" && v ? parsePassages(v) : undefined;
  const props = await editorProps(getDb(), {
    kind,
    anchor: ranges && v ? { v, ranges, translationId: tr } : undefined,
    back,
  });
  return <PostEditor {...props} />;
}
