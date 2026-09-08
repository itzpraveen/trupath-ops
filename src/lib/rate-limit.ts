/**
 * Sliding-window counter of failed attempts per key. Kept in memory: the app runs as one Render instance and
 * a reset on deploy is fine for sign-in throttling.
 */
export class FailureLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  /** Milliseconds until the key may try again, or 0 when it is not blocked. */
  retryAfter(key: string, now = Date.now()): number {
    const hits = this.prune(key, now);
    if (hits.length < this.max) return 0;
    return Math.max(1, hits[0] + this.windowMs - now);
  }

  fail(key: string, now = Date.now()) {
    const hits = this.prune(key, now);
    hits.push(now);
    this.hits.set(key, hits);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(key: string, now: number) {
    const hits = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (hits.length) this.hits.set(key, hits);
    else this.hits.delete(key);
    return hits;
  }
}

const g = globalThis as unknown as { __trupathLoginLimiter?: { email: FailureLimiter; ip: FailureLimiter } };
/** Sign-in throttle: 10 failures per email or 50 per IP address within 15 minutes. */
export const loginLimiter = (g.__trupathLoginLimiter ??= { email: new FailureLimiter(10, 15 * 60_000), ip: new FailureLimiter(50, 15 * 60_000) });
