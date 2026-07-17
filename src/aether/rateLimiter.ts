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
