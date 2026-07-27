/**
 * Backgammon Sound Effects
 *
 * Synthesises all game audio with the Web Audio API — no asset files needed.
 * Follows the same approach as `features/minigames/pong/lib/pongAudio.ts`.
 *
 * Playback is gated on the `vivo_sound_enabled` localStorage flag, which is
 * toggled from the sound button in GameSidebar. Every call is best-effort:
 * audio must never break gameplay, so all failures are swallowed.
 */

const STORAGE_KEY = 'vivo_sound_enabled';

/** True unless the user has explicitly muted (defaults to on). */
export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Persist the user's sound preference. */
export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) primeAudio();
  } catch {
    /* localStorage unavailable — ignore */
  }
}

type WindowWithAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/** Lazily create/resume the shared AudioContext. Returns null if unavailable. */
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const w = window as WindowWithAudio;
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Unlock audio playback from within a user gesture.
 *
 * Browsers start an AudioContext in the "suspended" state until a real user
 * interaction occurs. Calling this from a click/tap (e.g. rolling the dice)
 * means later programmatic sounds — such as the AI's moves — can play.
 */
export function primeAudio(): void {
  if (!isSoundEnabled()) return;
  getCtx();
}

interface ToneOptions {
  freq: number;
  /** Ramp to this frequency across the tone's duration. */
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds to delay before this tone starts. */
  delay?: number;
}

/** Play a single synthesised tone. Never throws. */
function tone({
  freq,
  endFreq,
  duration,
  type = 'sine',
  gain = 0.1,
  delay = 0,
}: ToneOptions): void {
  const audio = getCtx();
  if (!audio) return;

  try {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const start = audio.currentTime + delay;

    osc.connect(amp);
    amp.connect(audio.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== undefined) {
      // exponentialRamp cannot target 0 and both endpoints must be non-zero.
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(endFreq, 1),
        start + duration,
      );
    }

    // Quick attack, exponential decay — reads as a percussive "blip".
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.start(start);
    osc.stop(start + duration);
  } catch {
    /* audio failure must never interrupt the game */
  }
}

/** Game sound effects. All are no-ops while sound is disabled. */
export const sfx = {
  /** Soft click when a checker is placed. */
  move(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 320, endFreq: 180, duration: 0.09, type: 'triangle', gain: 0.08 });
  },

  /** Sharper, punchier hit when a blot is knocked to the bar. */
  hit(): void {
    if (!isSoundEnabled()) return;
    tone({ freq: 180, endFreq: 60, duration: 0.22, type: 'square', gain: 0.1 });
    tone({ freq: 90, endFreq: 40, duration: 0.26, type: 'sawtooth', gain: 0.06 });
  },

  /** Dice rattle: several short noisy blips in quick succession. */
  roll(): void {
    if (!isSoundEnabled()) return;
    for (let i = 0; i < 5; i++) {
      tone({
        freq: 400 + Math.random() * 500,
        endFreq: 200,
        duration: 0.05,
        type: 'square',
        gain: 0.045,
        delay: i * 0.055,
      });
    }
  },

  /** Rising arpeggio fanfare on game end. */
  win(): void {
    if (!isSoundEnabled()) return;
    // C5 - E5 - G5 - C6
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone({ freq, duration: 0.3, type: 'sine', gain: 0.09, delay: i * 0.11 });
    });
  },
};
