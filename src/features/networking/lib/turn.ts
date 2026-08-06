/**
 * TURN/ICE configuration helpers for H2H WebRTC.
 *
 * Priority:
 * 1. Edge Function `turn-credentials` when `VITE_TURN_URL` is set.
 * 2. Explicit `VITE_TURN_OVERRIDE_JSON` for static/manual credential fallback.
 * 3. STUN-only fallback if neither is available.
 */

export interface TurnConfig {
  iceServers: RTCIceServer[];
  source: 'edge' | 'override' | 'stun';
}

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

export function resolveTurnConfig(): TurnConfig {
  const explicit = import.meta.env.VITE_TURN_OVERRIDE_JSON as string | undefined;
  if (explicit && explicit.trim().length > 0) {
    try {
      const parsed = JSON.parse(explicit);
      if (Array.isArray(parsed?.iceServers) && parsed.iceServers.length > 0) {
        return { iceServers: parsed.iceServers, source: 'override' };
      }
    } catch {
      // ignore malformed override JSON
    }
  }

  const turnUrl = (import.meta.env.VITE_TURN_URL as string | undefined)?.trim();
  if (turnUrl) {
    return { iceServers: DEFAULT_STUN, source: 'stun' };
  }

  return { iceServers: DEFAULT_STUN, source: 'stun' };
}
