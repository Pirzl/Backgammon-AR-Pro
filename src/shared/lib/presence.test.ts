import { describe, it, expect } from 'vitest';
import { isRecentlyActive, ONLINE_THRESHOLD_MS } from './presence';

describe('isRecentlyActive (presence helper)', () => {
  const now = Date.now();

  it('returns true for a recent last_seen', () => {
    expect(isRecentlyActive(new Date(now - 10_000).toISOString(), now)).toBe(true);
  });

  it('returns true for a last_seen just under the threshold', () => {
    expect(isRecentlyActive(new Date(now - (ONLINE_THRESHOLD_MS - 1)).toISOString(), now)).toBe(true);
  });

  it('returns false when last_seen is older than the threshold', () => {
    expect(isRecentlyActive(new Date(now - ONLINE_THRESHOLD_MS).toISOString(), now)).toBe(false);
    expect(isRecentlyActive(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe(false);
  });

  it('returns false for null / undefined / invalid last_seen', () => {
    expect(isRecentlyActive(null, now)).toBe(false);
    expect(isRecentlyActive(undefined, now)).toBe(false);
    expect(isRecentlyActive('not-a-date', now)).toBe(false);
  });

  it('honors a custom threshold', () => {
    expect(isRecentlyActive(new Date(now - 30_000).toISOString(), now, 15_000)).toBe(false);
    expect(isRecentlyActive(new Date(now - 10_000).toISOString(), now, 15_000)).toBe(true);
  });
});
