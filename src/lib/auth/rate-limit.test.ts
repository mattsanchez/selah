import { describe, expect, it } from "vitest";

import { AttemptLimiter } from "./rate-limit";

describe("AttemptLimiter", () => {
  it("blocks a key after the maximum, until the window passes", () => {
    const limiter = new AttemptLimiter(3, 1000);
    for (const at of [0, 100, 200]) {
      expect(limiter.blocked("a", at)).toBe(false);
      limiter.record("a", at);
    }
    expect(limiter.blocked("a", 300)).toBe(true);
    expect(limiter.blocked("b", 300)).toBe(false);
    expect(limiter.blocked("a", 1001)).toBe(false);
  });

  it("forgets a key on reset", () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.record("a", 0);
    limiter.reset("a");
    expect(limiter.blocked("a", 1)).toBe(false);
  });

  it("holds a bounded number of keys", () => {
    const limiter = new AttemptLimiter(1, 1000, 2);
    limiter.record("a", 0);
    limiter.record("b", 0);
    limiter.record("c", 0);
    expect(limiter.blocked("a", 1)).toBe(false);
    expect(limiter.blocked("c", 1)).toBe(true);
  });
});
