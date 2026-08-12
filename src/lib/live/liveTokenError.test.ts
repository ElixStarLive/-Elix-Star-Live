import { describe, expect, it } from 'vitest';
import { isLivePublishDenied, isLiveTokenTransient } from './liveApi';

describe('live token error owner', () => {
  it('treats authorization refusal as denied, not transient', () => {
    expect(isLivePublishDenied('Not authorized to publish in this room.')).toBe(true);
    expect(isLivePublishDenied('HTTP_403')).toBe(true);
    expect(isLiveTokenTransient('Not authorized to publish in this room.')).toBe(false);
  });

  it('treats 5xx / network as transient', () => {
    expect(isLiveTokenTransient('HTTP_503')).toBe(true);
    expect(isLiveTokenTransient('DATABASE_UNAVAILABLE')).toBe(true);
    expect(isLiveTokenTransient('Failed to fetch')).toBe(true);
    expect(isLivePublishDenied('HTTP_503')).toBe(false);
  });

  it('does not treat missing stream as publish-denied', () => {
    expect(isLivePublishDenied('Stream not found or already ended.')).toBe(false);
    expect(isLiveTokenTransient('Stream not found or already ended.')).toBe(false);
  });
});
