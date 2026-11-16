import { describe, expect, it } from "vitest";

import { decideKept, newToken, type Kept, type Values } from "./kept-draft";

// What the editor does with text this browser kept, when it opens: by which
// save wrote what the server has, never by whose clock says what.

const T0 = "00000000-0000-4000-8000-000000000000";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const ID = "7d0e2f1c-6a7b-4c9d-8b6f-3c9e51a44a0b";

const values = (markdown: string): Values => ({ title: "Abide", markdown, tags: "" });
const kept = (markdown: string, base: string | null, sent: string[] = [], at = 0): Kept => ({
  v: 2,
  ...values(markdown),
  base,
  sent,
  at,
});
const server = (markdown: string, token: string | null, savedAt = "2026-11-16T10:00:00.000Z") => ({
  id: ID,
  values: values(markdown),
  token,
  savedAt,
});

describe("decideKept", () => {
  it("restores text written on what the server still has", () => {
    expect(decideKept(kept("Start. More.", T0), server("Start.", T0))).toBe("restore");
    // Text no editor save wrote (made in the reader, or before save tokens).
    expect(decideKept(kept("Start. More.", null), server("Start.", null))).toBe("restore");
  });

  it("restores text written after a save whose answer never came, which the server made", () => {
    // Typed " Second part." while the save of " First part." was on its way,
    // then reloaded before its answer: the server has the first part.
    expect(
      decideKept(kept("Start. First part. Second part.", T0, [T1]), server("Start. First part.", T1)),
    ).toBe("restore");
  });

  it("restores whatever the clocks say: publishing, or a browser hours behind", () => {
    // Publishing moves `updated_at` but not the token; `at` is the browser's
    // clock, a day behind the server's here, and is never compared.
    const behind = Date.parse("2026-11-15T10:00:00.000Z");
    expect(
      decideKept(kept("Start. After publishing.", T0, [], behind), server("Start.", T0, "2026-11-16T10:00:05.000Z")),
    ).toBe("restore");
  });

  it("drops text the server already has", () => {
    expect(decideKept(kept("Start. Done.", T0, [T1]), server("Start. Done.", T1))).toBe("drop");
    // Even when another save wrote the same text.
    expect(decideKept(kept("Start. Done.", T0), server("Start. Done.", T2))).toBe("drop");
  });

  it("does not restore over text another tab or device saved, nor throw the kept text away", () => {
    expect(decideKept(kept("Start. Mine.", T0), server("Start. Theirs.", T2))).toBe("conflict");
    expect(decideKept(kept("Start. Mine.", T0, [T1]), server("Start. Theirs.", T2))).toBe("conflict");
    // Written somewhere that did not say which save it was.
    expect(decideKept(kept("Start. Mine.", T0), server("Start. Theirs.", null))).toBe("conflict");
    expect(decideKept(kept("Start. Mine.", null), server("Start. Theirs.", T2))).toBe("conflict");
  });

  it("reads text kept before save tokens by the server's own time, and keeps it when unsure", () => {
    const old = { ...values("Start. Old."), base: "2026-11-16T10:00:00.000Z", at: Date.now() };
    expect(decideKept(old, server("Start.", T0, "2026-11-16T10:00:00.000Z"))).toBe("restore");
    // Saved (or published) since: not restored over it, and not dropped.
    expect(decideKept({ ...old, at: Date.now() + 3_600_000 }, server("Start.", T0, "2026-11-16T10:00:01.000Z"))).toBe(
      "conflict",
    );
    expect(decideKept(old, server("Start. Old.", T0, "2026-11-16T10:00:01.000Z"))).toBe("drop");
  });

  it("restores a new post's text unless it is blank", () => {
    const fresh = { values: values(""), token: null };
    expect(decideKept(kept("Begun.", null), fresh)).toBe("restore");
    expect(decideKept({ ...kept("  ", null), title: "" }, fresh)).toBe("drop");
  });
});

describe("newToken", () => {
  it("makes UUIDs the server takes, different every time", () => {
    const tokens = new Set(Array.from({ length: 100 }, newToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
