import { useState, useCallback, useRef } from 'react';
import { useSharedMediaPipe } from './useSharedMediaPipe';
import { blendHomographyMatrices } from './homography';

interface Point {
  x: number;
  y: number;
}

interface AdaptiveLearningHook {
  recordSuccess: (predicted: Point, actual: Point) => void;
  shouldPromptRecalibration: boolean;
  resetDriftWarning: () => void;
}

const SMOOTHING_FACTOR = 0.05; // Blend 5% of new correction
const DRIFT_THRESHOLD = 50; // pixels
const HISTORY_SIZE = 15;

/**
 * useAdaptiveLearning Hook
 * Tracks successful piece selections and refines the homography matrix over time.
 * Detects drift and prompts recalibration when corrections become too large.
 */
export function useAdaptiveLearning(): AdaptiveLearningHook {
  const { homographyMatrix, setHomographyMatrix } = useSharedMediaPipe();
  
  const [shouldPromptRecalibration, setShouldPromptRecalibration] = useState(false);
  const correctionHistory = useRef<Point[]>([]);

  const recordSuccess = useCallback((predicted: Point, actual: Point) => {
    if (!homographyMatrix) {
      console.warn('[Adaptive Learning] No homography matrix available');
      return;
    }

    // Compute correction delta
    const delta: Point = {
      x: actual.x - predicted.x,
      y: actual.y - predicted.y
    };

    const correctionMagnitude = Math.sqrt(delta.x * delta.x + delta.y * delta.y);

    console.log(`[Adaptive Learning] Correction delta: x=${delta.x.toFixed(2)}px, y=${delta.y.toFixed(2)}px, magnitude=${correctionMagnitude.toFixed(2)}px`);

    // Drift detection: if correction is too large, prompt recalibration
    if (correctionMagnitude > DRIFT_THRESHOLD) {
      console.warn(`[Adaptive Learning] Large drift detected: ${correctionMagnitude.toFixed(2)}px > ${DRIFT_THRESHOLD}px threshold`);
      setShouldPromptRecalibration(true);
      return;
    }

    // Add to history
    correctionHistory.current.push(delta);
    if (correctionHistory.current.length > HISTORY_SIZE) {
      correctionHistory.current.shift();
    }

    // Compute exponential moving average of corrections
    const avgDelta: Point = correctionHistory.current.reduce(
      (acc, d) => ({
        x: acc.x + d.x / correctionHistory.current.length,
        y: acc.y + d.y / correctionHistory.current.length
      }),
      { x: 0, y: 0 }
    );

    // Blend correction into homography matrix
    const refinedMatrix = blendHomographyMatrices(
      homographyMatrix,
      avgDelta,
      SMOOTHING_FACTOR
    );

    setHomographyMatrix(refinedMatrix);

    console.log(`[Adaptive Learning] Applied correction: avgDelta=(${avgDelta.x.toFixed(2)}, ${avgDelta.y.toFixed(2)}), samples=${correctionHistory.current.length}`);

    // TODO: Persist to localStorage with versioning
    // localStorage.setItem('vivo_adaptive_matrix_v3', JSON.stringify({
    //   version: 1,
    //   timestamp: Date.now(),
    //   // Note: Cannot serialize function, need different approach
    // }));

  }, [homographyMatrix, setHomographyMatrix]);

  const resetDriftWarning = useCallback(() => {
    setShouldPromptRecalibration(false);
    correctionHistory.current = [];
  }, []);

  return {
    recordSuccess,
    shouldPromptRecalibration,
    resetDriftWarning,
  };
}
