import { describe, expect, it } from 'vitest';
import { appendCapped, LIVE_CHAT_MESSAGE_CAP, LIVE_GIFT_QUEUE_CAP } from './liveRuntimeCaps';

describe('liveRuntimeCaps', () => {
  it('appends without trimming under the cap', () => {
    expect(appendCapped([1, 2], 3, 5)).toEqual([1, 2, 3]);
  });

  it('keeps only the newest items at the cap', () => {
    const next = appendCapped([1, 2, 3, 4], 5, 4);
    expect(next).toEqual([2, 3, 4, 5]);
    expect(next.length).toBe(4);
  });

  it('uses production caps that keep memory bounded', () => {
    expect(LIVE_CHAT_MESSAGE_CAP).toBeGreaterThan(50);
    expect(LIVE_CHAT_MESSAGE_CAP).toBeLessThanOrEqual(500);
    expect(LIVE_GIFT_QUEUE_CAP).toBeGreaterThan(0);
    expect(LIVE_GIFT_QUEUE_CAP).toBeLessThanOrEqual(20);
  });
});
