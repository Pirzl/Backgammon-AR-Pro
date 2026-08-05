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
  mode?: 'call' | 'tracking';
}

class SharedCamera {
  private callStream: MediaStream | null = null;
  private trackingStream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private callRefCount = 0;
  private trackingRefCount = 0;
  private creating: Promise<MediaStream | null> | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStream(mode: 'call' | 'tracking' = 'call'): MediaStream | null {
    return mode === 'tracking' ? this.trackingStream : this.callStream;
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
      if (!this.trackingStream) {
        const s = await this.create(opts.video ?? true, false, opts.deviceId, 'tracking');
        this.trackingStream = s;
      }
      return this.trackingStream;
    }

    this.callRefCount++;
    if (!this.callStream) {
      if (!this.creating) {
        this.creating = this.create(opts.video ?? true, opts.audio ?? false, opts.deviceId, 'call');
      }
      await this.creating;
      this.creating = null;
    } else if (opts.audio) {
      await this.ensureAudio();
    }
    return this.callStream;
  }

  release(mode: 'call' | 'tracking' = 'call') {
    if (mode === 'tracking') {
      this.trackingRefCount = Math.max(0, this.trackingRefCount - 1);
      if (this.trackingRefCount === 0 && this.trackingStream) {
        this.trackingStream.getTracks().forEach(t => t.stop());
        this.trackingStream = null;
        this.notify();
      }
      return;
    }

    this.callRefCount = Math.max(0, this.callRefCount - 1);
    if (this.callRefCount === 0) {
      this.teardownCall();
    }
  }

  async switchDevice(deviceId: string): Promise<void> {
    const applyToStream = async (stream: MediaStream | null, mode: 'call' | 'tracking') => {
      if (!stream) return;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      try {
        await videoTrack.applyConstraints({ deviceId: { exact: deviceId } });
      } catch (e) {
        console.warn(`[SharedCamera] applyConstraints falló (${mode}), recreando stream:`, e);
        const fresh = await this.create(true, mode === 'call' ? false : false, deviceId, mode);
        if (mode === 'call') {
          this.callStream = fresh ?? this.callStream;
        } else {
          this.trackingStream = fresh ?? this.trackingStream;
        }
      }
      this.notify();
    };

    await applyToStream(this.callStream, 'call');
    await applyToStream(this.trackingStream, 'tracking');
  }

  private async create(
    video: boolean,
    audio: boolean,
    deviceId?: string,
    mode: 'call' | 'tracking' = 'call'
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
        audio: mode === 'call' ? audio : false,
      };

      const s = await navigator.mediaDevices.getUserMedia(constraints);
      if (mode === 'call') {
        this.callStream = s;
        const audioTrack = s.getAudioTracks()[0] ?? null;
        if (audio && audioTrack) {
          this.audioTrack = audioTrack;
        }
      } else {
        this.trackingStream = s;
      }
      this.notify();
      return s;
    } catch (e) {
      if (mode === 'call' && audio && video) {
        console.warn('[SharedCamera] audio+video falló, reintentando solo video:', e);
        return this.create(video, false, deviceId, mode);
      }
      console.error('[SharedCamera] getUserMedia falló:', e);
      return null;
    }
  }

  private async ensureAudio(): Promise<void> {
    if (this.audioTrack || !this.callStream) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const t = s.getAudioTracks()[0];
      if (t) {
        this.audioTrack = t;
        this.callStream.addTrack(t);
        this.notify();
      }
    } catch (e) {
      console.warn('[SharedCamera] audio no disponible (el video continúa):', e);
    }
  }

  private teardownCall() {
    if (this.callStream) {
      this.callStream.getTracks().forEach((t) => t.stop());
      this.callStream = null;
    }
    this.audioTrack = null;
    this.notify();
  }
}

export const sharedCamera = new SharedCamera();
