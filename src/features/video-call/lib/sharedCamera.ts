// ----------------------------------------------------------------------
// SHARED CAMERA MANAGER
// ----------------------------------------------------------------------
// Una ÚNICA fuente de cámara para toda la app. La videollamada (useVideoChat)
// y el hand tracking (useCamera) comparten el mismo MediaStream, con lo que
// NO hay un segundo getUserMedia que en móvil provoque "cámara en uso".
//
// Uso:
//   const stream = await sharedCamera.acquire({ video: true, audio: true });
//   ...
//   sharedCamera.release();  // decrementa refcount; libera HW al llegar a 0
//
// El audio se añade de forma aditiva (nunca rompe el video si el micrófono
// se deniega). El track de video es ÚNICO y compartido.
// ----------------------------------------------------------------------

import { isMobileDevice } from '../../../shared/lib/device';

type Listener = () => void;

interface AcquireOptions {
  video?: boolean;
  audio?: boolean;
  deviceId?: string;
}

class SharedCamera {
  private stream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private refCount = 0;
  private creating: Promise<MediaStream | null> | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  }

  /** Obtiene el stream compartido. Cada llamada DEBE emparejarse con release(). */
  async acquire(opts: AcquireOptions = {}): Promise<MediaStream | null> {
    const video = opts.video ?? true;
    const audio = opts.audio ?? false;
    this.refCount++;

    if (!this.stream) {
      if (!this.creating) {
        this.creating = this.create(video, audio, opts.deviceId);
      }
      await this.creating;
      this.creating = null;
    } else if (audio) {
      await this.ensureAudio();
    }

    return this.stream;
  }

  release() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.teardown();
    }
  }

  /** Cambia de dispositivo de video (reemplaza el track compartido). */
  async switchDevice(deviceId: string): Promise<void> {
    if (!this.stream) {
      await this.acquire({ video: true, audio: false, deviceId });
      return;
    }

    const videoTrack = this.stream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({ deviceId: { exact: deviceId } });
        this.notify();
        return;
      } catch (e) {
        console.warn('[SharedCamera] applyConstraints falló, recreando stream:', e);
      }
    }

    videoTrack?.stop();
    const fresh = await this.create(true, false, deviceId);
    if (fresh && this.stream) {
      // Reemplaza los tracks de video del stream compartido conservando el audio
      const oldVideoTrack = this.stream.getVideoTracks()[0];
      if (oldVideoTrack) this.stream.removeTrack(oldVideoTrack);
      fresh.getVideoTracks().forEach((t) => this.stream?.addTrack(t));
    }
    this.notify();
  }

  private async create(
    video: boolean,
    audio: boolean,
    deviceId?: string,
  ): Promise<MediaStream | null> {
    try {
      const isMobile = isMobileDevice();
      // En móvil bajamos resolución y FPS: menos encode/decode e inferencia
      // de MediaPipe → sin sobrecalentamiento ni batería drenada.
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
        audio,
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
      // Si pedimos audio+video juntos y el micrófono se deniega, reintenta
      // con SOLO video para no perder la cámara (fallback crítico en móvil).
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
