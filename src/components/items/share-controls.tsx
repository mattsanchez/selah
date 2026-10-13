import { setVisibilityAction } from "@/app/items/actions";
import type { ItemVisibility } from "@/lib/items/queries";

const button =
  "cursor-pointer text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:text-stone-100";

function Set({ id, to, children }: { id: string; to: ItemVisibility; children: string }) {
  return (
    <form action={setVisibilityAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="visibility" value={to} />
      <button type="submit" className={button}>
        {children}
      </button>
    </form>
  );
}

// "Share" on an item, where it is listed: puts a private item in the feed,
// and takes a shared one out of it or changes who it is shared with. A
// highlight is shared with these; a reflection or a note can be too, though
// the editor is where it is published.
export function ShareControls({ id, visibility }: { id: string; visibility: ItemVisibility }) {
  if (visibility === "private") {
    return (
      <Set id={id} to="public">
        Share
      </Set>
    );
  }
  return (
    <>
      <Set id={id} to="private">
        Unshare
      </Set>
      {visibility === "public" ? (
        <Set id={id} to="unlisted">
          Make unlisted
        </Set>
      ) : (
        <Set id={id} to="public">
          Make public
        </Set>
      )}
    </>
  );
}
