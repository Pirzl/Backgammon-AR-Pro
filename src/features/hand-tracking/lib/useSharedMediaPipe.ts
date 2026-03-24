import { useContext } from "react";
import { MediaPipeContext, type MediaPipeContextValue } from "./MediaPipeContext";

/**
 * Hook para acceder al contexto compartido de MediaPipe.
 * Devuelve valores seguros si el provider no está presente.
 */
export function useSharedMediaPipe(): MediaPipeContextValue {
  const ctx = useContext(MediaPipeContext);

  if (!ctx) {
    return {
      landmarks: null,
      isModelLoading: false,
      error: null,
      startDetection: () => {},
      stopDetection: () => {},
      videoDimensions: null,
      homographyMatrix: null,
      setHomographyMatrix: () => {},
      calibrationPoints: null,
      setCalibrationPoints: () => {},
      handCalibration: null,
      setHandCalibration: () => {}
    };
  }

  return ctx;
}
