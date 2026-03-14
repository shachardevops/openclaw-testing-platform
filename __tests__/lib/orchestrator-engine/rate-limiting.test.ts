import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '@/lib/orchestrator-engine';

describe('RateLimiter', () => {
  let limiter: InstanceType<typeof RateLimiter>;

  beforeEach(() => {
    limiter = new RateLimiter(6);
  });

  it('allows sends when under the limit', () => {
    expect(limiter.canSend()).toBe(true);
  });

  it('blocks sends when at the limit', () => {
    for (let i = 0; i < 6; i++) {
      limiter.record();
    }
    expect(limiter.canSend()).toBe(false);
  });

  it('reports correct remaining count', () => {
    expect(limiter.remaining).toBe(6);
    limiter.record();
    limiter.record();
    expect(limiter.remaining).toBe(4);
  });

  it('resets after timestamps expire (>60s)', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    for (let i = 0; i < 6; i++) {
      limiter.record();
    }
    expect(limiter.canSend()).toBe(false);

    // Advance time by 61 seconds
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
    expect(limiter.canSend()).toBe(true);
    expect(limiter.remaining).toBe(6);

    vi.restoreAllMocks();
  });

  it('partially expires old timestamps', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Record 4 messages
    for (let i = 0; i < 4; i++) {
      limiter.record();
    }

    // Advance 30s, record 2 more
    vi.spyOn(Date, 'now').mockReturnValue(now + 30000);
    limiter.record();
    limiter.record();
    expect(limiter.canSend()).toBe(false);

    // Advance to 61s — first 4 expire, 2 remain
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
    expect(limiter.canSend()).toBe(true);
    expect(limiter.remaining).toBe(4);

    vi.restoreAllMocks();
  });

  it('handles custom maxPerMinute', () => {
    const smallLimiter = new RateLimiter(2);
    smallLimiter.record();
    smallLimiter.record();
    expect(smallLimiter.canSend()).toBe(false);
    expect(smallLimiter.remaining).toBe(0);
  });
});
