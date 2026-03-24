import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGestureRecognition } from './useGestureRecognition';
import type { HandLandmarkerResult, Landmark } from '@mediapipe/tasks-vision';

// Mock data helper - Now includes wrist(0) and middleMcp(9) for adaptive threshold calculation
// PINCH_RATIO = 0.6, RELEASE_RATIO = 0.8
// With refScale = 0.1 (distance from wrist to middleMcp), thresholds become:
// - Pinch: 0.1 * 0.6 = 0.06
// - Release: 0.1 * 0.8 = 0.08
const createLandmarks = (thumbDist: number): HandLandmarkerResult => {
  const landmarks: Landmark[] = Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  
  // Wrist (0) at origin
  landmarks[0] = { x: 0, y: 0, z: 0, visibility: 1 };
  // Middle MCP (9) at distance 0.1 for reference scale
  landmarks[9] = { x: 0.1, y: 0, z: 0, visibility: 1 };
  // Index Tip (8)
  landmarks[8] = { x: 0, y: 0, z: 0, visibility: 1 };
  // Thumb Tip (4) at specified distance from index
  landmarks[4] = { x: thumbDist, y: 0, z: 0, visibility: 1 };

  return {
    landmarks: [landmarks],
    worldLandmarks: [],
    handednesses: []
  } as unknown as HandLandmarkerResult;
};

describe('useGestureRecognition', () => {
  let mockTime = 0;
  let performanceSpy: ReturnType<typeof vi.spyOn>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockTime = 0;
    performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockTime);
  });

  afterEach(() => {
    performanceSpy?.mockRestore();
  });

  it('should initialize Open', () => {
    const { result } = renderHook(() => useGestureRecognition());
    expect(result.current.gesture).toBe('open');
    expect(result.current.isPinching).toBe(false);
  });

  it('should detect Pinch when distance < adaptive threshold (0.06)', () => {
    const { result } = renderHook(() => useGestureRecognition());
    
    // With refScale=0.1 and PINCH_RATIO=0.6, threshold = 0.06
    // Distance 0.04 < 0.06 → should trigger pinch
    act(() => {
      result.current.processLandmarks(createLandmarks(0.04));
    });

    expect(result.current.gesture).toBe('pinch');
    expect(result.current.isPinching).toBe(true);
  });

  it('should release Pinch only after hysteresis (dist > 0.08) and debounce delay', () => {
    const { result } = renderHook(() => useGestureRecognition());
    
    // With refScale=0.1: pinchThreshold=0.06, releaseThreshold=0.08
    
    // 1. Trigger Pinch at t=0 (0.04 < 0.06)
    act(() => {
      result.current.processLandmarks(createLandmarks(0.04));
    });
    expect(result.current.gesture).toBe('pinch');

    // 2. Advance time past debounce window
    mockTime += 150;

    // 3. Move to 0.07 (Still pinched: 0.07 < releaseThreshold 0.08)
    act(() => {
      result.current.processLandmarks(createLandmarks(0.07));
    });
    expect(result.current.gesture).toBe('pinch');

    // 4. Advance time again
    mockTime += 150;

    // 5. Move to 0.10 (Release: 0.10 > 0.08)
    act(() => {
      result.current.processLandmarks(createLandmarks(0.10));
    });
    expect(result.current.gesture).toBe('open');
  });

  it('should handle empty landmarks gracefully', () => {
    const { result } = renderHook(() => useGestureRecognition());
    
    act(() => {
      result.current.processLandmarks({ 
        landmarks: [], 
        worldLandmarks: [], 
        handednesses: [] 
      } as unknown as HandLandmarkerResult);
    });

    expect(result.current.gesture).toBe('open');
    expect(result.current.cursor).toBeNull();
  });
});
