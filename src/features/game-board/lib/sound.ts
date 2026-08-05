/**
 * Sound effects via the Web Audio API.
 *
 * Synthesizes short, subtle SFX at runtime so the project needs no binary audio
 * assets. All playback is best-effort: if the AudioContext is unavailable
 * (blocked autoplay, unsupported browser) calls are no-ops.
 *
 * A single shared AudioContext is lazily created on first user gesture to
 * satisfy browser autoplay policies.
 */

let ctx: AudioContext | null = null;

/**
 * Master sound switch (persisted to localStorage so the user's choice survives
 * reloads). Defaults to ON. All synthesis is gated on this flag.
 */
const SOUND_KEY = 'vivo_sound_enabled';

function readSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

let soundEnabled = readSoundEnabled();

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(on: boolean): void {
  soundEnabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on.toString());
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Browsers suspend the context until a user gesture; resume on demand.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user-gesture handler (e.g. first click) to unlock audio. */
export function primeAudio(): void {
  getCtx();
}

type Wave = OscillatorType;

function tone(
  freq: number,
  duration: number,
  opts: { type?: Wave; gain?: number; delay?: number; sweepTo?: number } = {}
): void {
  if (!soundEnabled) return;
  const audio = getCtx();
  if (!audio) return;
  const { type = 'sine', gain = 0.15, delay = 0, sweepTo } = opts;
  const start = audio.currentTime + delay;

  const osc = audio.createOscillator();
  const env = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);

  // Quick attack, smooth decay — avoids clicks.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env);
  env.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(duration: number, gain = 0.12): void {
  if (!soundEnabled) return;
  const audio = getCtx();
  if (!audio) return;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Dice-like rattle: decaying white noise.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const env = audio.createGain();
  env.gain.setValueAtTime(gain, audio.currentTime);
  env.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  src.connect(env);
  env.connect(audio.destination);
  src.start();
}

export const sfx = {
  roll(): void {
    // Rattling tumble then two clacks.
    noiseBurst(0.18, 0.10);
    tone(420, 0.06, { type: 'square', gain: 0.12, delay: 0.14 });
    tone(520, 0.06, { type: 'square', gain: 0.12, delay: 0.22 });
  },
  move(): void {
    tone(300, 0.07, { type: 'triangle', gain: 0.14, sweepTo: 200 });
  },
  hit(): void {
    // Sharp capture: discordant double thunk.
    tone(180, 0.12, { type: 'sawtooth', gain: 0.18, sweepTo: 120 });
    tone(90, 0.14, { type: 'square', gain: 0.16, delay: 0.03 });
  },
  win(): void {
    // Rising arpeggio fanfare.
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.16, delay: i * 0.12 }));
  },
  button(): void {
    tone(660, 0.04, { type: 'sine', gain: 0.08 });
  },
};
