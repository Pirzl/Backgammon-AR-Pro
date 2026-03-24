import { useState, useRef, useEffect, useCallback } from 'react';


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

export function useCamera() {
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setCameraState(prev => ({ ...prev, stream: null }));
    }
  }, []);

  // -----------------------------
  // START CAMERA (with fallback)
  // -----------------------------
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraState(prev => ({ ...prev, isLoading: true, error: null }));

      // 1. Secure Context check
      if (!window.isSecureContext) {
        setCameraState(prev => ({
          ...prev,
          error: 'La cámara requiere HTTPS o localhost',
          isLoading: false,
        }));
        return;
      }



      // 2. Resolution fallback list

            // 3. Try to get stream
      try {
        if (initInProgressRef.current) return;
        initInProgressRef.current = true;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            // Using ideal instead of exact prevents OverconstrainedError if a saved device disappears
            deviceId: deviceId ? { ideal: deviceId } : undefined,
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            // Removed max: 30 which causes issues on some virtual/mac cameras
            frameRate: { ideal: 30 }
          }
        });


        // SEC-002: HARDWARE CAPABILITY VERIFICATION (Anti-Virtual Camera)
        const videoTrack = newStream.getVideoTracks()[0];
        // Define interface for capabilities if missing in current lib
        interface ExtendedCapabilities extends MediaTrackCapabilities {
          zoom?: number;
          focusMode?: string;
        }

        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          const capabilities = videoTrack.getCapabilities() as ExtendedCapabilities;
          // Virtual cameras often miss these specific hardware capabilities
          const isVirtual = !capabilities.facingMode && !capabilities.focusMode && !capabilities.zoom;
          
          if (isVirtual) {
            console.warn('[Security] Virtual camera detected. High-security features may be limited.');
            setCameraState(prev => ({ ...prev, warning: 'Cámara virtual detectada. Si no ves imagen, conecta una física.' }));
          } else {
            setCameraState(prev => ({ ...prev, warning: null }));
          }
        }


        streamRef.current = newStream;
        
        if (videoRef.current) {
          // Clear previous stream to avoid AbortError
          if (videoRef.current.srcObject && videoRef.current.srcObject !== newStream) {
             const prev = videoRef.current.srcObject as MediaStream;
             prev.getTracks().forEach(t => t.stop());
             videoRef.current.srcObject = null;
          }

          const wasMuted = videoRef.current.muted;
          videoRef.current.muted = true;
          videoRef.current.srcObject = newStream;
          
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn('Video play error (handled):', e);
          } finally {
            videoRef.current.muted = wasMuted;
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
          error: null
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
          stream: null
        }));
      } finally {
        initInProgressRef.current = false;
      }
    },
    [enumerateCameras]
  );



  // -----------------------------
  // SWITCH CAMERA
  // -----------------------------
  const switchCamera = useCallback(
    async (deviceId: string) => {
      stopCamera();
      await startCamera(deviceId);
    },
    [stopCamera, startCamera]
  );

  // -----------------------------
  // AUTO-START ON MOUNT
  // -----------------------------
  useEffect(() => {
    const init = async () => {
      const saved = localStorage.getItem(CAMERA_PREFERENCE_KEY);

      if (saved) {
        try {
          await startCamera(saved);
          return;
        } catch {
          await startCamera();
        }
      } else {
        await startCamera();
      }
    };

    init();

    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return {
    videoRef,
    startCamera,
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
