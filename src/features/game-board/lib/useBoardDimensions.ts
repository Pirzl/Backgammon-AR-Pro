import { useState, useEffect, useRef } from 'react';

export interface BoardDimensions {
  width: number;
  height: number;
  top: number;
  left: number;
  aspectRatio: number;
}

/**
 * useBoardDimensions
 * 
 * Provides responsive dimensions of the board container.
 * Uses ResizeObserver for high-performance updates.
 */
export function useBoardDimensions() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<BoardDimensions>({
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    aspectRatio: 1
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const rect = entry.target.getBoundingClientRect();
        
        setDimensions({
          width,
          height,
          top: rect.top,
          left: rect.left,
          aspectRatio: width / height
        });
      }
    });

    observer.observe(element);

    // Initial measurement
    const rect = element.getBoundingClientRect();
    setDimensions({
       width: rect.width,
       height: rect.height,
       top: rect.top,
       left: rect.left,
       aspectRatio: rect.width / rect.height
    });

    return () => observer.disconnect();
  }, []);

  /**
   * Helper to convert Normalized Coordinates (0-1) to Screen Pixels
   */
  const getPixelCoordinates = (normalizedX: number, normalizedY: number) => {
    return {
      x: dimensions.left + (normalizedX * dimensions.width),
      y: dimensions.top + (normalizedY * dimensions.height)
    };
  };

  return { 
    containerRef, 
    dimensions,
    getPixelCoordinates 
  };
}
