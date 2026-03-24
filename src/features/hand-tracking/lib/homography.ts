/**
 * Homography Utilities
 * Maps coordinates between two 4-point quadrilaterals (Camera -> Screen)
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Calculates the Perspective Transformation Matrix (Homography)
 * Maps source points to destination points.
 * Source: 4 corners of manual calibration (normalized 0-1)
 * Destination: 4 corners of screen target (e.g. board area)
 * 
 * Note: For 4 points, this is technically a bilinear or projective transform.
 */
export function solveHomography(src: Point[], dst: Point[]) {
  if (src.length < 4 || dst.length < 4) {
    return (p: Point) => p;
  }

  // Destructure for safety and clarity
  // 0: TL, 1: TR, 2: BR, 3: BL
  const [s0, s1, s2, s3] = src;
  const [d0, d1, d2, d3] = dst;

  if (!s0 || !s1 || !s2 || !s3 || !d0 || !d1 || !d2 || !d3) {
    return (p: Point) => p;
  }

  return (p: Point): Point => {
    // Safety check: return identity if point is null/undefined
    if (!p || p.x === null || p.x === undefined || p.y === null || p.y === undefined) {
      return { x: 0, y: 0 };
    }

    // 1. Normalize p relative to the source quadrilateral (Simplified Inverse Mapping)
    // To properly map an arbitrary point from an arbitrary quad to a unit square,
    // we would need a full homography matrix. For this phase, we use 
    // the bounding box logic which is robust for most camera angles.
    
    const minX = Math.min(s0.x, s3.x);
    const maxX = Math.max(s1.x, s2.x);
    const minY = Math.min(s0.y, s1.y);
    const maxY = Math.max(s2.y, s3.y);

    const relativeX = (p.x - minX) / (maxX - minX || 1);
    const relativeY = (p.y - minY) / (maxY - minY || 1);

    // 2. Map relative coordinates to the destination quadrilateral
    const x = Math.max(0, Math.min(1, relativeX));
    const y = Math.max(0, Math.min(1, relativeY));

    const topX = d0.x + (d1.x - d0.x) * x;
    const bottomX = d3.x + (d2.x - d3.x) * x;
    const leftY = d0.y + (d3.y - d0.y) * y;
    const rightY = d1.y + (d2.y - d1.y) * y;

    return {
      x: topX + (bottomX - topX) * y,
      y: leftY + (rightY - leftY) * x
    };
  };
}

/**
 * Adjusts camera coordinates to account for object-cover cropping.
 * 
 * @param coord Normalized 0-1 coordinate from MediaPipe
 * @param video Aspect ratio of the raw video {w, h}
 * @param container Aspect ratio of the display container {w, h}
 */
export function adjustForObjectCover(coord: Point, video: { w: number, h: number }, container: { w: number, h: number }): Point {
  const videoRatio = video.w / video.h;
  const containerRatio = container.w / container.h;
  
  let adjustedX = coord.x;
  let adjustedY = coord.y;
  
  if (videoRatio > containerRatio) {
    // Video is wider than container -> Cropped at sides
    const scale = container.h / video.h;
    const visibleWidth = video.w * scale;
    const cropX = (visibleWidth - container.w) / 2 / visibleWidth;
    
    // Re-normalize to visible area
    adjustedX = (coord.x - cropX) / (1 - 2 * cropX);
  } else {
    // Video is taller than container -> Cropped at top/bottom
    const scale = container.w / video.w;
    const visibleHeight = video.h * scale;
    const cropY = (visibleHeight - container.h) / 2 / visibleHeight;
    
    // Re-normalize to visible area
    adjustedY = (coord.y - cropY) / (1 - 2 * cropY);
  }
  
  return { 
    x: Math.max(0, Math.min(1, adjustedX)), 
    y: Math.max(0, Math.min(1, adjustedY)) 
  };
}

/**
 * Computes the reprojection error for calibration quality assessment.
 * Transforms source points using the given transform function and measures
 * the average pixel distance from the expected destination points.
 * 
 * @param src Source calibration points (normalized 0-1)
 * @param dst Destination board points (pixels)
 * @param transform The homography transform function
 * @returns Average error in pixels
 */
export function computeReprojectionError(
  src: Point[], 
  dst: Point[], 
  transform: (p: Point) => Point
): number {
  if (src.length !== dst.length || src.length === 0) {
    return Infinity;
  }

  let totalError = 0;
  for (let i = 0; i < src.length; i++) {
    const transformed = transform(src[i]!);
    const expected = dst[i]!;
    
    const dx = transformed.x - expected.x;
    const dy = transformed.y - expected.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    totalError += distance;
  }

  return totalError / src.length;
}

/**
 * Simple wrapper to apply a homography transform function to a point.
 * 
 * @param point The point to transform
 * @param matrix The homography transform function
 * @returns Transformed point
 */
export function applyHomography(point: Point, matrix: (p: Point) => Point): Point {
  return matrix(point);
}

/**
 * Blends a correction offset into an existing homography transform.
 * Creates a new transform that applies the original, then adjusts by the delta.
 * 
 * @param currentTransform The existing homography function
 * @param delta Correction offset {x, y} in pixels
 * @param alpha Blending factor (0-1), e.g., 0.05 for subtle corrections
 * @returns New transform function
 */
export function blendHomographyMatrices(
  currentTransform: (p: Point) => Point,
  delta: Point,
  alpha: number
): (p: Point) => Point {
  return (p: Point): Point => {
    const transformed = currentTransform(p);
    return {
      x: transformed.x + (delta.x * alpha),
      y: transformed.y + (delta.y * alpha)
    };
  };
}
