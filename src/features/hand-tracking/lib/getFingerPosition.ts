import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';


interface Point3D {
  x: number; 
  y: number; 
  z: number;
}

interface FingerPositionOptions {
  mirrorX?: boolean; // Default true for front camera
  rotation?: number;  // 0, 90, 180, 270 (Degrees, clockwise)
}

/**
 * Universal function to extract the Index Finger Tip (Landmark 8) position.
 * Handles mirroring and platform-specific quirks if needed.
 * Returns normalized coordinates (0-1).
 */
export function getFingerPosition(
  results: HandLandmarkerResult, 
  options: FingerPositionOptions = {}
): Point3D | null {
  
  if (!results.landmarks || results.landmarks.length === 0) {
    return null;
  }

  const hand = results.landmarks[0]; // Assuming single hand for now, as per simplified flow
  if (!hand || hand.length < 21) return null;

  // Landmark 8 is Index Finger Tip
  const indexTip = hand[8];
  if (!indexTip) return null;

  let x = indexTip.x;
  let y = indexTip.y;
  const z = indexTip.z;

  // 1. Apply Mirroring (Common for selfie cameras)
  // Default to true if not specified
  const shouldMirror = options.mirrorX !== undefined ? options.mirrorX : true;
  if (shouldMirror) {
    x = 1 - x;
  }

  // 2. Apply Rotation (e.g. mobile portrait vs landscape)
  // MediaPipe usually outputs normalized coordinates relative to image buffer.
  // If the image buffer is rotated (e.g. iOS portrait), we might need to swap X/Y.
  if (options.rotation) {
    const rad = (options.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // Rotate around center (0.5, 0.5)
    const cx = 0.5;
    const cy = 0.5;
    
    const dx = x - cx;
    const dy = y - cy;
    
    // Standard 2D rotation
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    
    x = rx + cx;
    y = ry + cy;
  }
  
  // 3. Platform Specific Adjustments
  // In future, if iOS/Android need specific tweaks (e.g. aspect ratio correction 
  // embedded in coordinates), add them here.
  // Currently MediaPipe results are consistently normalized 0-1.

  return { x, y, z };
}

interface ScreenProjectionOptions {
  containerWidth: number;
  containerHeight: number;
  videoWidth?: number;
  videoHeight?: number;
  objectCover?: boolean; // If true, simulates CSS object-fit: cover
}

/**
 * Projects a normalized point (0-1) to Screen/Container coordinates.
 * Handles 'object-fit: cover' logic if video dimensions are provided.
 */
export function projectToScreen(
  point: Point3D, 
  options: ScreenProjectionOptions
): { x: number, y: number } {
  const { containerWidth, containerHeight, videoWidth, videoHeight, objectCover } = options;
  
  // Simple stretching if no video dimensions or objectCover false
  if (!videoWidth || !videoHeight || !objectCover) {
    return {
      x: point.x * containerWidth,
      y: point.y * containerHeight
    };
  }

  // Complex 'object-fit: cover' logic
  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  
  const renderedW = videoWidth * scale;
  const renderedH = videoHeight * scale;
  
  const cropX = (renderedW - containerWidth) / 2;
  const cropY = (renderedH - containerHeight) / 2;
  
  return {
    x: (point.x * renderedW) - cropX,
    y: (point.y * renderedH) - cropY
  };
}
