import { useRef, useEffect } from 'react';
import { HandLandmarker, DrawingUtils, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

interface HandDebugProps {
  landmarks: HandLandmarkerResult | null;
  width: number;
  height: number;
  gesture?: string;
  showCursor?: boolean;
}

/**
 * HandDebug Component
 * Visualizes the Hand Skeleton overlay for debugging and calibration.
 * Uses MediaPipe's DrawingUtils for standardized skeleton rendering.
 */
export function HandDebug({ landmarks, width, height, gesture, showCursor = true }: HandDebugProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !landmarks || landmarks.landmarks.length === 0) {
      // Clear canvas if no hands
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, width, height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    const drawingUtils = new DrawingUtils(ctx);
    
    // Determine cursor style based on gesture
    const isPinch = gesture === 'pinch';
    const cursorColor = isPinch ? '#FF0000' : '#00FF00'; // Red for Pinch, Green for Point
    const cursorRadius = isPinch ? 8 : 12;

    // Draw landmarks for each detected hand
    for (const landmark of landmarks.landmarks) {
      drawingUtils.drawLandmarks(landmark, { color: '#FF0000', lineWidth: 2, radius: 2 }); // Skeleton Nodes
      drawingUtils.drawConnectors(landmark, HandLandmarker.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 }); // Skeleton Lines
      
      // Draw Cursor EXACTLY at Index Tip (Landmark 8) if enabled
      // This guarantees alignment because it shares the same coordinate space/transform as the skeleton.
      const indexTip = landmark[8];
      if (showCursor && indexTip) {
         const x = indexTip.x * width;
         const y = indexTip.y * height;
         
         ctx.beginPath();
         ctx.arc(x, y, cursorRadius, 0, 2 * Math.PI); 
         ctx.lineWidth = 3;
         ctx.strokeStyle = cursorColor; 
         ctx.stroke();
         
         // Inner dot
         ctx.beginPath();
         ctx.arc(x, y, isPinch ? 8 : 4, 0, 2 * Math.PI);
         ctx.fillStyle = cursorColor;
         ctx.fill();
         
         // visual label
         ctx.fillStyle = 'rgba(255,255,255,0.7)';
         ctx.font = '10px monospace';
         const label = isPinch ? 'GRAB' : 'V2 (CANVAS)';
         ctx.fillText(label, x + 15, y);
      }
    }

  }, [landmarks, width, height, gesture, showCursor]);

  return (
    <canvas 
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-x-[-1]"
    />
  );
}
