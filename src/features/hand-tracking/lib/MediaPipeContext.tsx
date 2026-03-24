import { createContext } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

export interface Point {
  x: number;
  y: number;
}

export interface MediaPipeContextValue {
  landmarks: HandLandmarkerResult | null;
  isModelLoading: boolean;
  error: string | null;
  startDetection: (video: HTMLVideoElement) => void;
  stopDetection: () => void;
  videoDimensions: { width: number; height: number } | null;
  
  // Homography calibration state
  homographyMatrix: ((p: Point) => Point) | null;
  setHomographyMatrix: (fn: ((p: Point) => Point) | null) => void;
  calibrationPoints: Point[] | null;
  setCalibrationPoints: (points: Point[] | null) => void;

  // Hand Calibration State
  handCalibration: HandCalibration | null;
  setHandCalibration: (data: HandCalibration | null) => void;
}

export interface HandCalibration {
  isRightHand: boolean;
  scale: number; // 1.0 = default
  offset: { x: number; y: number }; // normalized drift
  rotation: number;
}

export const MediaPipeContext = createContext<MediaPipeContextValue | null>(null);
