import { useState, useEffect, useRef } from "react";
import { useGestureRecognition } from "./useGestureRecognition";
import { useSharedMediaPipe } from "./useSharedMediaPipe";
import type { BoardDimensions } from "../../game-board/lib/useBoardDimensions";

import { encodeHandFrame, type HandFrame } from "./HandProtocol"; // NEW

interface InteractionPoint {
  x: number;
  y: number;
}

interface HandInteractionReturn {
  isHandActive: boolean;
  gesture: "open" | "pinch";
  cursor: InteractionPoint | null;
  normalizedParams: InteractionPoint | null;
  pointId: number | null;
}

// CONSTANTS FOR TUNING
const EMA_ALPHA = 0.2; // Smoothing factor (Keep high for stability)

/**
 * useHandInteraction — Universal Landmark 8 Implementation
 *
 * Features:
 * 1. Direct Window Mapping (Full Screen Camera)
 * 2. Exponential Smoothing (Anti-Jitter)
 * 3. Aspect Ratio Color Correction (Cover)
 * 4. Network Broadcasting (HandProtocol)
 */
export function useHandInteraction(
  containerDimensions?: BoardDimensions,
  isTurnActive: boolean = true,
  onFrameReady?: (frame: HandFrame) => void // NEW: Callback for networking
): HandInteractionReturn {
  const { landmarks, videoDimensions } = useSharedMediaPipe();
  const {
    gesture,
    cursor: rawCursor,
    processLandmarks,
  } = useGestureRecognition();

  const [screenCursor, setScreenCursor] = useState<InteractionPoint | null>(null);

  // Process landmarks (Pipeline entry)
  useEffect(() => {
    if (landmarks) {
      processLandmarks(landmarks);
    }
  }, [landmarks, processLandmarks]);

  const smoothedPosRef = useRef<InteractionPoint | null>(null);
  const sequenceRef = useRef(0); // NEW: Local sequence counter

  // MAIN POSITION MAPPING LOOP
  useEffect(() => {
    // Requires landmarks to function (rawCursor is derived from landmarks but we need raw for the 8th point)
    // Also requires valid container dimensions
    if (
      !landmarks ||
      landmarks.landmarks.length === 0 ||
      !videoDimensions ||
      !containerDimensions ||
      containerDimensions.width === 0
    ) {
      if (smoothedPosRef.current !== null) {
        requestAnimationFrame(() => {
          setScreenCursor(null);
          smoothedPosRef.current = null;
        });
      }
      return;
    }

    const hand = landmarks.landmarks[0];
    if (!hand) return;

    const indexTip = hand[8]; // Landmark 8
    if (!indexTip) return;

    // 1. Get Normalized Coordinates based on Camera Type
    // TODO: Detect isFrontCamera. For now, we assume TRUE (Mirroring enabled)
    // as this is standard for webcams/selfie mode.
    const isFrontCamera = true;

    // User Algo Step 2: Correct Mirroring
    const x = isFrontCamera ? 1 - indexTip.x : indexTip.x;
    const y = indexTip.y;

    // 2. Convert to Video Pixels (User Algo Step 3)
    const videoWidth = videoDimensions.width;
    const videoHeight = videoDimensions.height;

    const px = x * videoWidth;
    const py = y * videoHeight;

    // 3. Container Dimensions (Explicitly passed from parent)
    const containerWidth = containerDimensions.width;
    const containerHeight = containerDimensions.height;

    // 4. Correct for object-fit: cover (User Algo Step 4)
    const videoRatio = videoWidth / videoHeight;
    const containerRatio = containerWidth / containerHeight;

    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    if (videoRatio > containerRatio) {
      // video cropped left/right
      // To cover, we match height.
      scale = containerHeight / videoHeight;
      offsetX = (containerWidth - videoWidth * scale) / 2;
    } else {
      // video cropped top/bottom
      // To cover, we match width.
      scale = containerWidth / videoWidth;
      offsetY = (containerHeight - videoHeight * scale) / 2;
    }

    const finalX = px * scale + offsetX;
    const finalY = py * scale + offsetY;

    // 5. Exponential Smoothing (Anti-Jitter)
    // Adjusted relative to container position (containerDimensions.left/top) if needed?
    // Usually setScreenCursor is relative to the container for `absolute` positioning.
    // If HandTrackingLayer is `absolute inset-0`, then (0,0) is correct relative to container.
    // However, if we needed specific alignment:
    // const absX = finalX + containerDimensions.left;
    // BUT HandTrackingLayer is usually inside the same relative container.
    // We assume `finalX/Y` are local to the `containerDimensions` box.

    let smoothedX = finalX;
    let smoothedY = finalY;

    if (smoothedPosRef.current) {
      smoothedX =
        finalX * EMA_ALPHA + smoothedPosRef.current.x * (1 - EMA_ALPHA);
      smoothedY =
        finalY * EMA_ALPHA + smoothedPosRef.current.y * (1 - EMA_ALPHA);
    }

    const smoothedPos = { x: smoothedX, y: smoothedY };
    smoothedPosRef.current = smoothedPos;

    // 6. NETWORK BROADCAST (NEW)
    if (onFrameReady) {
        // We use the normalized coordinates (x, y) derived earlier
        // x = 0..1 (Mirror corrected)
        // y = 0..1
        
        // Use ref for sequence to avoid global scope pollution
        // const seq = (window as any)._handSeq = ((window as any)._handSeq || 0) + 1;
        const seq = sequenceRef.current++;
        
        const frame: HandFrame = encodeHandFrame({
            t: Date.now(),
            seq: seq,
            x: x,
            y: y,
            g: gesture === 'pinch' ? 1 : 0,
            c: 1.0, // TODO: Get real confidence from MediaPipe
        });
        
        onFrameReady(frame);
    }

    requestAnimationFrame(() => {
      setScreenCursor(smoothedPos);
    });
  }, [landmarks, videoDimensions, containerDimensions, gesture, onFrameReady]);

  return {
    isHandActive: !!rawCursor,
    gesture: isTurnActive ? gesture : "open",
    cursor: screenCursor,
    normalizedParams: rawCursor, // We pass raw cursor if needed for debug, or null if hand lost
    pointId: null,
  };
}
