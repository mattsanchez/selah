// Counts failures per key in a sliding window, in memory. Used to slow
// password guessing and to cap how many sign-in emails can be requested. A
// restart clears it, which is fine for both uses.
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    // Bounds memory when someone sprays made-up keys.
    private readonly maxKeys = 5000,
  ) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (kept.length > 0) this.attempts.set(key, kept);
    else this.attempts.delete(key);
    return kept;
  }

  blocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.max;
  }

  record(key: string, now = Date.now()): void {
    const kept = this.recent(key, now);
    if (!this.attempts.has(key) && this.attempts.size >= this.maxKeys) {
      // Drop the oldest key; Map keeps insertion order.
      const oldest = this.attempts.keys().next().value;
      if (oldest !== undefined) this.attempts.delete(oldest);
    }
    this.attempts.set(key, [...kept, now]);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
