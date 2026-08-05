/**
 * Presence helpers — single source of truth for "is this profile online?".
 *
 * Online is derived ONLY from last_seen recency (the heartbeat timestamp),
 * never from the sticky `profiles.status` column: that column is only reset to
 * 'offline' on clean logout/beforeunload, which does not fire reliably on
 * mobile/crash — relying on it produces permanent false "online" states.
 */
export const ONLINE_THRESHOLD_MS = 60 * 1000;

/** Whether `lastSeen` is within `thresholdMs` of `now` (default 60s). */
export function isRecentlyActive(
  lastSeen: string | null | undefined,
  now: number,
  thresholdMs: number = ONLINE_THRESHOLD_MS
): boolean {
  if (!lastSeen) return false;
  const time = new Date(lastSeen).getTime();
  if (Number.isNaN(time)) return false;
  return now - time < thresholdMs;
}
