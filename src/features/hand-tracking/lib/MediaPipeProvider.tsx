import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  type ReactNode,
} from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { MediaPipeContext } from "./MediaPipeContext";
import { POWER_PROFILE } from "../../../shared/lib/device";


export function MediaPipeProvider({ children }: { children: ReactNode }) {
  const [landmarks, setLandmarks] = useState<HandLandmarkerResult | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Homography calibration state
  const [homographyMatrix, setHomographyMatrix] = useState<((p: { x: number; y: number }) => { x: number; y: number }) | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [handCalibration, setHandCalibration] = useState<import("./MediaPipeContext").HandCalibration | null>(null);

  const videoDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastDetectionRef = useRef<number>(0);
  const lastHandSeenAtRef = useRef<number>(0); // Adaptive idle mode
  const loopRef = useRef<() => void>(() => {});
  const isWorkerProcessing = useRef(false);

  // --- WORKER INITIALIZATION ---
  useEffect(() => {
    // SECURITY: Use classic worker to support importScripts for MediaPipe UMD
    // Vite Analysis: MUST use inline new URL() for bundler to detect and hash correct file.
    // We remove the manual 'v' param as Vite handles hashing.
    const worker = new Worker(
      new URL('../workers/hand-detection.worker.ts', import.meta.url),
      { type: 'classic' }
    );
    
    worker.onmessage = (e) => {
      const { type, landmarks: result, error: workerError } = e.data;
      
      if (type === 'LOADED') {
        setIsModelLoading(false);
        console.log('[MediaPipe] Worker Loaded');
      } else if (type === 'RESULT') {
        isWorkerProcessing.current = false; // Mark as free
        startTransition(() => {
          setLandmarks(result as HandLandmarkerResult);
        });
        // Adaptive throttle: record when a hand was last seen so the loop can
        // drop to idle cadence when nobody's hand is in the camera.
        if (result && result.landmarks && result.landmarks.length > 0) {
          lastHandSeenAtRef.current = performance.now();
        }
      } else if (type === 'ERROR') {
        isWorkerProcessing.current = false; // Mark as free even on error
        setError(workerError);
        console.error('[MediaPipe] Worker Error:', workerError);
      }
    };

    // P0: Fetch Model in Main Thread (Trusted) and transfer to Worker (Isolated)
    const initWorker = async () => {
     // Use local model file for offline support and security control
    try {
    const mediaPipeBase = (import.meta.env.VITE_MEDIAPIPE_BASE_URL as string) || "";
    const modelUrl = mediaPipeBase ? `${mediaPipeBase}/hand_landmarker.task` : "/mediapipe/hand_landmarker.task";
            const response = await fetch(modelUrl);
            if (!response.ok) throw new Error('Failed to fetch model');
            const buffer = await response.arrayBuffer();
            
            // SEC-003: MODEL INTEGRITY VERIFICATION
            // Expected SHA-256 hash for hand_landmarker.task (float16)
            // Replace this with the actual hash logged in console if different upon update.
            const EXPECTED_MODEL_HASH = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
            
            if (window.crypto && window.crypto.subtle) {
                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                console.debug('[Security] Model integrity hash:', hashHex);

                if (EXPECTED_MODEL_HASH && hashHex !== EXPECTED_MODEL_HASH) {
                    throw new Error(`Security Exception: Model integrity check failed. Expected ${EXPECTED_MODEL_HASH}, got ${hashHex}`);
                }
            }
            
            // Transfer buffer to worker
            worker.postMessage({ type: 'LOAD', modelBuffer: buffer, mediaPipeBase }, [buffer]);
        } catch (err) {
            setError('Failed to load MediaPipe model: ' + err);
        }
    };

    initWorker();
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const worker = workerRef.current;

    if (!video || !worker) return;

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.readyState < 2
    ) {
      // Sin feed activo: poll tranquilo con setTimeout (ahorra batería/CPU
      // cuando la cámara está apagada) en vez de rAF a 60fps.
      requestRef.current = window.setTimeout(() => loopRef.current(), 200);
      return;
    }

    // ADAPTIVE THROTTLE: si no hay mano detectada recientemente bajamos la
    // cadencia a modo idle (evita CPU/GPU al máximo y sobrecalentamiento).
    const now = performance.now();
    const idle = now - lastHandSeenAtRef.current > POWER_PROFILE.idleAfterMs;
    const interval = idle
      ? POWER_PROFILE.idleIntervalMs()
      : POWER_PROFILE.activeIntervalMs();
    const elapsed = now - lastDetectionRef.current;
    if (elapsed < interval) {
       requestRef.current = requestAnimationFrame(() => loopRef.current());
       return;
    }

    lastDetectionRef.current = now;

    // Dimensions Check
    const dims = videoDimensionsRef.current;
    if (!dims || dims.width !== video.videoWidth || dims.height !== video.videoHeight) {
      const newDims = { width: video.videoWidth, height: video.videoHeight };
      videoDimensionsRef.current = newDims;
      setVideoDimensions(newDims);
    }

    // FRAME DOWNSCALE: en móvil se envía media resolución a MediaPipe (el
    // landmarker devuelve coordenadas normalizadas, así que el mapeo a
    // pantalla no cambia). El coste de inferencia baja ~4x.
    const scale = POWER_PROFILE.frameScale();
    const targetW = Math.max(1, Math.round(video.videoWidth * scale));
    const targetH = Math.max(1, Math.round(video.videoHeight * scale));
    const shouldResize = targetW !== video.videoWidth || targetH !== video.videoHeight;

    // Capture Frame
    // P0: Use ImageBitmap to avoid serializing heavy blobs and transfer ownership
    // Fallback for strict browsers or older iOS (Device Compatibility)
    try {
        if (!isWorkerProcessing.current) { // BACKPRESSURE CONTROL
            if (typeof createImageBitmap !== 'undefined') {
                isWorkerProcessing.current = true;
                const opts: ImageBitmapOptions = shouldResize
                  ? { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'low' }
                  : {};
                createImageBitmap(video, opts).then(bitmap => {
                    worker.postMessage({ 
                        type: 'DETECT', 
                        videoFrame: bitmap, 
                        timestamp: now 
                    }, [bitmap]); // Transfer!
                }).catch(e => {
                    console.warn('[MediaPipe] Bitmap creation failed', e);
                    isWorkerProcessing.current = false;
                });
            } else {
                // FALLBACK: Use Canvas for ImageData (iOS < 15, etc.)
                // This is slower but enables compatibility
                if (!canvasRef.current) {
                    canvasRef.current = document.createElement('canvas');
                }
                const canvas = canvasRef.current;
                  
                if (canvas.width !== targetW || canvas.height !== targetH) {
                    canvas.width = targetW;
                    canvas.height = targetH;
                }
                 
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    ctx.drawImage(video, 0, 0, targetW, targetH);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    isWorkerProcessing.current = true;
                    worker.postMessage({ 
                        type: 'DETECT', 
                        videoFrame: imageData, 
                        timestamp: now 
                    }, [imageData.data.buffer]);
                }
            }
        }
    } catch (err) {
        console.warn("[MediaPipe] Loop error:", err);
        isWorkerProcessing.current = false;
    }

    requestRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);


  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const stopDetection = useCallback(() => {
    if (requestRef.current != null) {
      cancelAnimationFrame(requestRef.current);
      clearTimeout(requestRef.current);
      requestRef.current = null;
    }
    videoRef.current = null;
  }, []);

  const startDetection = useCallback(
    (video: HTMLVideoElement) => {
      videoRef.current = video;
      
      if (!isModelLoading && !requestRef.current) {
        loop();
      }
    },
    [loop, isModelLoading]
  );
  
  // Auto-start loop when model matches readiness
  useEffect(() => {
      if (!isModelLoading && videoRef.current && !requestRef.current) {
          loop();
      }
  }, [isModelLoading, loop]);

  return (
    <MediaPipeContext.Provider
      value={{
        landmarks,
        isModelLoading,
        error,
        startDetection,
        stopDetection,
        videoDimensions,
        homographyMatrix,
        setHomographyMatrix,
        calibrationPoints,
        setCalibrationPoints,
        handCalibration,
        setHandCalibration,
      }}
    >
      {children}
    </MediaPipeContext.Provider>
  );
}
