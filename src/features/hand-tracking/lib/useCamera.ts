import { useState, useRef, useEffect, useCallback } from 'react';
import { sharedCamera } from '../../video-call/lib/sharedCamera';


interface CameraDevice {
  deviceId: string;
  label: string;
  isFrontFacing: boolean;
}

interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  isLoading: boolean;
  availableCameras: CameraDevice[];
  selectedDeviceId: string | null;
  warning?: string | null;
}

const CAMERA_PREFERENCE_KEY = 'backgammon-vivo-preferred-camera';

export interface UseCameraOptions {
  autoStart?: boolean;
  /**
   * Modo compartido: reutiliza la cámara ÚNICA de la app (videollamada).
   * Evita el segundo getUserMedia que en móvil provoca "cámara en uso".
   * El stream NO se detiene al soltarlo si la llamada sigue activa.
   */
  shared?: boolean;
}

export function useCamera(_options: UseCameraOptions = {}) {
  const { shared = false } = _options;
  const [cameraState, setCameraState] = useState<CameraState>({
    stream: null,
    error: null,
    isLoading: true,
    availableCameras: [],
    selectedDeviceId: null,
    warning: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const initInProgressRef = useRef(false);
  const hasClaimRef = useRef(false);

  // -----------------------------
  // ENUMERATE CAMERAS
  // -----------------------------
  const enumerateCameras = useCallback(async (): Promise<CameraDevice[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'videoinput' && d.label)
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
          isFrontFacing:
            device.label.toLowerCase().includes('front') ||
            device.label.toLowerCase().includes('facetime'),
        }));
    } catch (err) {
      console.warn('Failed to enumerate cameras:', err);
      return [];
    }
  }, []);

  // -----------------------------
  // STOP CAMERA
  // -----------------------------
  const stopCamera = useCallback(() => {
    if (shared) {
      // Solo libera si este hook tiene un claim activo (evita dobles release
      // porque HandTrackingLayer llama stopCamera y useCamera también).
      if (hasClaimRef.current) {
        hasClaimRef.current = false;
        sharedCamera.release('tracking');
      }
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraState(prev => ({ ...prev, stream: null }));
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraState(prev => ({ ...prev, stream: null }));
    }
  }, [shared]);

  // -----------------------------
  // START CAMERA (with fallback)
  // -----------------------------
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraState(prev => ({ ...prev, isLoading: true, error: null }));

      if (!window.isSecureContext) {
        setCameraState(prev => ({
          ...prev,
          error: 'La cámara requiere HTTPS o localhost',
          isLoading: false,
        }));
        return;
      }

      try {
        if (initInProgressRef.current) return;
        initInProgressRef.current = true;

        const newStream = shared
          ? await sharedCamera.acquire({ video: true, audio: false, deviceId, mode: 'tracking' })
          : await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: deviceId ? { ideal: deviceId } : undefined,
                facingMode: deviceId ? undefined : { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
              },
            });

        if (!newStream) throw new Error('camera unavailable');

        hasClaimRef.current = shared;
        streamRef.current = newStream;

        if (videoRef.current) {
          if (videoRef.current.srcObject && videoRef.current.srcObject !== newStream) {
            const prev = videoRef.current.srcObject as MediaStream;
            prev.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
          }

          videoRef.current.muted = true;
          videoRef.current.srcObject = newStream;
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn('Video play error (handled):', e);
          }
        }

        const cameras = await enumerateCameras();
        const settings = newStream.getVideoTracks()[0]?.getSettings();
        const actualDeviceId = settings?.deviceId || deviceId || null;

        setCameraState(prev => ({
          ...prev,
          stream: newStream,
          isLoading: false,
          availableCameras: cameras,
          selectedDeviceId: actualDeviceId,
          error: null,
        }));

        if (actualDeviceId) {
          localStorage.setItem(CAMERA_PREFERENCE_KEY, actualDeviceId);
        }
      } catch (unknownErr) {
        console.error('Error accessing camera:', unknownErr);
        let errorMessage = 'No se pudo acceder a la cámara. Revisa permisos.';
        if (unknownErr instanceof Error) {
          if (unknownErr.name === 'NotFoundError' || unknownErr.name === 'DevicesNotFoundError') {
            errorMessage = 'No se detectó ninguna cámara conectada. Por favor, conecta una y recarga.';
          } else if (unknownErr.name === 'NotAllowedError' || unknownErr.name === 'PermissionDeniedError') {
            errorMessage = 'Permiso de cámara denegado. Autoriza el acceso en tu navegador.';
          } else if (unknownErr.name === 'NotReadableError' || unknownErr.name === 'TrackStartError') {
            errorMessage = 'La cámara está en uso por otra aplicación o está bloqueada.';
          } else if (unknownErr.name === 'OverconstrainedError') {
            errorMessage = 'La cámara no soporta la resolución o formato requerido.';
          }
        }

        setCameraState(prev => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
          stream: null,
        }));
      } finally {
        initInProgressRef.current = false;
      }
    },
    [enumerateCameras, shared]
  );

  // Public start that won't double-start if already running
  const startCameraIfNeeded = useCallback(
    async (deviceId?: string) => {
      // En modo shared SIEMPRE adquirimos (cada acquire empareja con un release);
      // el guard solo aplica al modo propietario.
      if (!shared && streamRef.current) return;
      await startCamera(deviceId);
    },
    [startCamera, shared]
  );

  // -----------------------------
  // SWITCH CAMERA
  // -----------------------------
  const switchCamera = useCallback(
    async (deviceId: string) => {
      if (shared) {
        await sharedCamera.switchDevice(deviceId);
        streamRef.current = sharedCamera.getStream();
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        setCameraState(prev => ({
          ...prev,
          stream: streamRef.current,
          selectedDeviceId: deviceId,
        }));
        return;
      }
      stopCamera();
      await startCamera(deviceId);
    },
    [shared, stopCamera, startCamera]
  );

  // -----------------------------
  // SHARED MODE: Sync with the shared stream
  // -----------------------------
  useEffect(() => {
    if (!shared) return;
    const sync = () => {
      const s = sharedCamera.getStream();
      if (s && s !== streamRef.current) {
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => undefined);
        }
        setCameraState(prev => ({
          ...prev,
          stream: s,
          isLoading: false,
          error: null,
        }));
      }
    };
    // Si la cámara ya está activa (p.ej. la llamada la tomó primero), sincroniza ya.
    sync();
    const unsubscribe = sharedCamera.subscribe(sync);
    return unsubscribe;
  }, [shared]);

  // -----------------------------
  // NO AUTO-START ON MOUNT
  // -----------------------------
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return {
    videoRef,
    startCamera: startCameraIfNeeded,
    stopCamera,
    switchCamera,
    availableCameras: cameraState.availableCameras,
    selectedDeviceId: cameraState.selectedDeviceId,
    stream: cameraState.stream,
    error: cameraState.error,
    warning: cameraState.warning,
    isLoading: cameraState.isLoading,
  };
}
