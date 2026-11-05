interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class AetherRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly maximumRequests: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now
  ) {}

  consume(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.clock();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      // Bound identifier retention without background timers or evicting live limits.
      if (this.buckets.size >= 10000) {
        for (const [id, bucket] of this.buckets) {
          if (bucket.resetAt <= now) this.buckets.delete(id);
        }
        if (this.buckets.size >= 10000) return { allowed: false, retryAfterMs: this.windowMs };
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (current.count >= this.maximumRequests) {
      return { allowed: false, retryAfterMs: current.resetAt - now };
    }

    current.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}
