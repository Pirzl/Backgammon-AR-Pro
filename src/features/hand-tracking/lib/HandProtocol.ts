/**
 * HandProtocol.ts
 * Defines the compact protocol for transmitting hand tracking data over WebRTC.
 */

// 0: Open, 1: Pinch, 2: Closed (Future)
export type HandGestureId = 0 | 1 | 2; 

export interface HandFrame {
  t: number;   // Timestamp (Unix Ms) - Used for LERP
  seq: number; // Sequence Number - Used for packet loss detection
  x: number;   // Normalized X (0-1)
  y: number;   // Normalized Y (0-1)
  g: HandGestureId; // Gesture ID
  c: number;   // Confidence Score (0-1)
  v?: [number, number]; // Velocity Vector [vx, vy] (Optional, for prediction)
  s?: string;  // Signature (HMAC) - Optional for now
}

export const HAND_PROTOCOL_VERSION = 1;

/**
 * Validates and decodes an incoming payload into a HandFrame.
 * Returns null if invalid.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeHandFrame(data: any): HandFrame | null {
    if (!data) return null;
    
    // Basic Schema Validation
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    if (typeof data.t !== 'number' || typeof data.seq !== 'number') return null;
    
    // Bounds Check (Loose, allowing slight overscan)
    // if (data.x < -0.5 || data.x > 1.5) return null; 
    
    return {
        t: data.t,
        seq: data.seq,
        x: data.x,
        y: data.y,
        g: (data.g === 0 || data.g === 1 || data.g === 2) ? data.g : 0,
        c: typeof data.c === 'number' ? data.c : 0,
        v: Array.isArray(data.v) && data.v.length === 2 ? data.v : undefined
    };
}

/**
 * Encodes a HandFrame for transmission.
 * Currently returns the object identity, but strictly typed.
 * Future: Binary packing / Protobuf.
 */
export function encodeHandFrame(frame: HandFrame): HandFrame {
    // P0: Add HMAC signing here if enabled
    return frame;
}
