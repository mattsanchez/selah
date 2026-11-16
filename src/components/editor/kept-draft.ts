// Text the editor keeps in this browser until the server has it, and how to
// tell, when the editor opens, whether it follows what the server has (see
// use-autosave.ts). Nothing here reads a clock to decide.

export type Values = { title: string; markdown: string; tags: string };

export const same = (a: Values, b: Values) =>
  a.title === b.title && a.markdown === b.markdown && a.tags === b.tags;

export const blank = (values: Values) => !values.title.trim() && !values.markdown.trim() && !values.tags.trim();

// A save's token: a random UUID. Not crypto.randomUUID(), which a site
// served over plain http (a home server on the local network) does not have.
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Tokens of saves sent without an answer that a save may build on; older
// ones are forgotten (a save after that many lost answers is a conflict).
export const MAX_UNANSWERED = 16;

// What this browser keeps of text the server may not have.
export type Kept = Values & {
  v: 2;
  // The token of the save of the item this text follows (null: text no
  // editor save wrote).
  base: string | null;
  // Saves of it sent since, whose answers never came: any of them may have
  // been made.
  sent: string[];
  // When it was kept, by this browser's clock: for reading, never compared
  // with the server's.
  at: number;
};

// Kept text before save tokens: `base` was the item's `updated_at` then.
export type OldKept = Partial<Values> & { base?: string; at?: number };

export type KeptDecision = "restore" | "conflict" | "drop";

// What to do with text this browser kept, when the editor opens on what the
// server has. Text the server already has is dropped. Text that follows the
// item's text (written on it, or on a save of it sent since) is restored and
// saved. Anything else conflicts.
export function decideKept(
  kept: Kept | OldKept,
  server: { id?: string; values: Values; token: string | null; savedAt?: string },
): KeptDecision {
  const draft = keptValues(kept);
  if (!server.id) return blank(draft) ? "drop" : "restore";
  if (same(draft, server.values)) return "drop";
  if ("v" in kept && kept.v === 2) {
    const sent = Array.isArray(kept.sent) ? kept.sent : [];
    return kept.base === server.token || (server.token !== null && sent.includes(server.token))
      ? "restore"
      : "conflict";
  }
  // Kept before save tokens: it follows the item only if the item has not
  // been written since, by its own (server) time.
  return kept.base !== undefined && kept.base === server.savedAt ? "restore" : "conflict";
}

export function keptValues(kept: Partial<Values>): Values {
  return { title: String(kept.title ?? ""), markdown: String(kept.markdown ?? ""), tags: String(kept.tags ?? "") };
}
