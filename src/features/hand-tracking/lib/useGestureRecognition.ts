import { useState, useRef, useCallback } from 'react';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { getFingerPosition } from './getFingerPosition';

export type GestureType = 'open' | 'pinch';

interface HandCursor {
  x: number;
  y: number;
  z: number;
}

interface UseGestureRecognitionReturn {
  gesture: GestureType;
  cursor: HandCursor | null;
  isPinching: boolean;
  processLandmarks: (result: HandLandmarkerResult) => void;
}

/**
 * ADAPTIVE THRESHOLDS (Optimized for Mobile + PC)
 * 
 * Palm-based scaling makes pinch detection consistent across:
 * - mobile cameras (close range)
 * - desktop webcams (farther range)
 */
const PINCH_RATIO = 0.55;     // pinch when < 55% of palm size
const RELEASE_RATIO = 0.78;   // release when > 78% of palm size
const GESTURE_DEBOUNCE_MS = 80; // more stable on mobile

export function useGestureRecognition(): UseGestureRecognitionReturn {
  const [gesture, setGesture] = useState<GestureType>('open');
  const [cursor, setCursor] = useState<HandCursor | null>(null);
  const [isPinching, setIsPinching] = useState(false);

  const wasPinchingRef = useRef(false);
  const lastGestureChangeTime = useRef(-Infinity);
  
  // SECURITY: Liveness tracking
  const livenessHistoryRef = useRef<{x: number, y: number, z: number}[]>([]);
  const MAX_LIVENESS_HISTORY = 10;

  const processLandmarks = useCallback((result: HandLandmarkerResult) => {
    // 0. INPUT VALIDATION (SEC-004)
    if (!result || !Array.isArray(result.landmarks)) {
        console.warn('[Security] Invalid landmark result structure');
        return;
    }

    if (result.landmarks.length === 0) {
      setCursor(null);
      livenessHistoryRef.current = []; // Reset liveness history

      if (wasPinchingRef.current) {
        setGesture('open');
        setIsPinching(false);
        wasPinchingRef.current = false;
        lastGestureChangeTime.current = performance.now();
      }
      return;
    }

    const hand = result.landmarks[0];
    if (!hand || hand.length < 21) return;

    const thumbTip = hand[4];
    const indexTip = hand[8];
    const wrist = hand[0];
    const middleMcp = hand[9];

    if (!thumbTip || !indexTip || !wrist || !middleMcp) return;

    // 0.5 LIVENESS CHECK (SEC-001: Anti-Spoofing)
    // Real hands have micro-jitter in Z-depth and small X/Y variations. Static images don't.
    livenessHistoryRef.current.push({ x: wrist.x, y: wrist.y, z: wrist.z });
    if (livenessHistoryRef.current.length > MAX_LIVENESS_HISTORY) {
        livenessHistoryRef.current.shift();
    }

    // Check for variation in any dimension (Z is most critical for anti-spoofing)
    const zCoords = livenessHistoryRef.current.map(p => p.z);
    const xCoords = livenessHistoryRef.current.map(p => p.x);
    const yCoords = livenessHistoryRef.current.map(p => p.y);
    
    const zVar = Math.max(...zCoords) - Math.min(...zCoords);
    const xyVar = (Math.max(...xCoords) - Math.min(...xCoords)) + (Math.max(...yCoords) - Math.min(...yCoords));

    const isLivenessVerified = livenessHistoryRef.current.length < MAX_LIVENESS_HISTORY || 
        zVar > 0.0001 || xyVar > 0.001; 

    if (!isLivenessVerified) {
        console.warn('[Security] Liveness check failed: Possible gesture spoofing detected');
    }

    // 1. RAW cursor using Universal Utility (Mirrored by default for interaction)
    const currentCursor = getFingerPosition(result);
    
    if (currentCursor) {
        setCursor(currentCursor);
    }

    // 2. Pinch distance (3D)
    const pinchDistance = Math.sqrt(
      (thumbTip.x - indexTip.x) ** 2 +
      (thumbTip.y - indexTip.y) ** 2 +
      (thumbTip.z - indexTip.z) ** 2
    );

    // 3. Palm reference scale
    const refScale = Math.sqrt(
      (wrist.x - middleMcp.x) ** 2 +
      (wrist.y - middleMcp.y) ** 2 +
      (wrist.z - middleMcp.z) ** 2
    );

    const scale = Math.max(refScale, 0.01);

    const pinchThreshold = scale * PINCH_RATIO;
    const releaseThreshold = scale * RELEASE_RATIO;

    // 4. State machine + debouncing
    const now = performance.now();
    const timeSinceLast = now - lastGestureChangeTime.current;

    if (timeSinceLast < GESTURE_DEBOUNCE_MS) return;

    if (wasPinchingRef.current) {
      // ALWAYS allow release for UX safety, even if liveness fails during a move
      if (pinchDistance > releaseThreshold) {
        setGesture('open');
        setIsPinching(false);
        wasPinchingRef.current = false;
        lastGestureChangeTime.current = now;
      }
    } else {
      // ONLY allow new pinch if liveness is verified
      if (isLivenessVerified && pinchDistance < pinchThreshold) {
        setGesture('pinch');
        setIsPinching(true);
        wasPinchingRef.current = true;
        lastGestureChangeTime.current = now;

        if (navigator.vibrate) navigator.vibrate(20);
      }
    }
  }, []);

  return {
    gesture,
    cursor,
    isPinching,
    processLandmarks
  };
}
