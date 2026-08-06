// ----------------------------------------------------------------------
// SHARED CAMERA MANAGER
// ----------------------------------------------------------------------
// Una ÚNICA fuente de cámara (UN solo getUserMedia) para TODA la app.
// La videollamada (useVideoChat) y el hand tracking (useCamera) comparten
// el mismo MediaStream — en móvil H2H abrir dos streams simultáneos
// disparaba "cámara en uso" y rompía el hand tracking.
//
// El "mode" (call/tracking) solo cuenta refcounts independientes para saber
// cuándo liberar hardware; el stream de video es SIEMPRE el mismo. El audio
// se añade de forma aditiva (nunca rompe el video si el micrófono se deniega).
//
// Uso:
//   const stream = await sharedCamera.acquire({ video: true, audio: true, mode: 'call' });
//   const trackStream = await sharedCamera.acquire({ video: true, mode: 'tracking' }); // MISO stream
//   ...
//   sharedCamera.release('call');  // o release('tracking')
// ----------------------------------------------------------------------

import { isMobileDevice } from '../../../shared/lib/device';

type Listener = () => void;

interface AcquireOptions {
  video?: boolean;
  audio?: boolean;
  deviceId?: string;
  mode?: 'call' | 'tracking';
}

class SharedCamera {
  private stream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private callRefCount = 0;
  private trackingRefCount = 0;
  private creating: Promise<MediaStream | null> | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // El stream es ÚNICO; el mode se acepta por compatibilidad de llamada.
  getStream(_mode?: 'call' | 'tracking'): MediaStream | null {
    return this.stream;
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
  }

  async acquire(opts: AcquireOptions = {}): Promise<MediaStream | null> {
    const mode = opts.mode ?? 'call';
    if (mode === 'tracking') {
      this.trackingRefCount++;
    } else {
      this.callRefCount++;
    }

    // Crea el stream ÚNICO la primera vez (cualquier modo); los siguientes
    // acquire REUTILIZAN el mismo stream — nunca un segundo getUserMedia.
    if (!this.stream) {
      if (!this.creating) {
        this.creating = this.create(opts.video ?? true, opts.audio ?? false, opts.deviceId);
      }
      await this.creating;
      this.creating = null;
    } else if (mode === 'call' && opts.audio) {
      await this.ensureAudio();
    }
    return this.stream;
  }

  release(mode: 'call' | 'tracking' = 'call') {
    if (mode === 'tracking') {
      this.trackingRefCount = Math.max(0, this.trackingRefCount - 1);
    } else {
      this.callRefCount = Math.max(0, this.callRefCount - 1);
    }
    // Hardware se libera SOLO cuando ambos consumidores han soltado.
    if (this.callRefCount === 0 && this.trackingRefCount === 0) {
      this.teardown();
    }
  }

  async switchDevice(deviceId: string): Promise<void> {
    if (!this.stream) return;
    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      await videoTrack.applyConstraints({ deviceId: { exact: deviceId } });
    } catch (e) {
      console.warn('[SharedCamera] applyConstraints falló, recreando stream:', e);
      const fresh = await this.create(true, false, deviceId);
      this.stream = fresh ?? this.stream;
    }
    this.notify();
  }

  private async create(
    video: boolean,
    audio: boolean,
    deviceId?: string
  ): Promise<MediaStream | null> {
    try {
      const isMobile = isMobileDevice();
      const videoConstraints: MediaTrackConstraints = isMobile
        ? {
            facingMode: deviceId ? undefined : { ideal: 'user' },
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 24, max: 30 },
          }
        : {
            facingMode: deviceId ? undefined : { ideal: 'user' },
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          };

      const constraints: MediaStreamConstraints = {
        video: video ? videoConstraints : false,
        audio: audio, // Solo el PRIMER acquire (normalmente call) pide audio
      };

      const s = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = s;
      const audioTrack = s.getAudioTracks()[0] ?? null;
      if (audio && audioTrack) {
        this.audioTrack = audioTrack;
      }
      this.notify();
      return s;
    } catch (e) {
      if (audio && video) {
        console.warn('[SharedCamera] audio+video falló, reintentando solo video:', e);
        return this.create(video, false, deviceId);
      }
      console.error('[SharedCamera] getUserMedia falló:', e);
      return null;
    }
  }

  private async ensureAudio(): Promise<void> {
    if (this.audioTrack || !this.stream) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const t = s.getAudioTracks()[0];
      if (t) {
        this.audioTrack = t;
        this.stream.addTrack(t);
        this.notify();
      }
    } catch (e) {
      console.warn('[SharedCamera] audio no disponible (el video continúa):', e);
    }
  }

  private teardown() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.audioTrack = null;
    this.notify();
  }
}

export const sharedCamera = new SharedCamera();
