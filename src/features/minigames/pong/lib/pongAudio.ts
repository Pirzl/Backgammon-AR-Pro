/**
 * Pong Retro Audio Engine
 * Generates synthetic sounds using Web Audio API. 
 * No external files required.
 */

class PongAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setEnabled(val: boolean) {
    this.enabled = val;
    if (val) this.initCtx();
  }

  playBip(type: 'bounce' | 'score' | 'powerup' | 'fail') {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case 'bounce':
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'score':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'powerup':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.setValueAtTime(440, now + 0.05);
        osc.frequency.setValueAtTime(550, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'fail':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.4);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
    }
  }
}

export const pongAudio = new PongAudioEngine();
