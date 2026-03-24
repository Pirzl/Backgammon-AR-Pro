import { useState, useCallback, useEffect } from 'react';
import type { BoardDimensions } from './useBoardDimensions';

export interface PointGeometry {
  x: number;      // Relative to container-left (padding box)
  y: number;      // Relative to container-top (padding box)
  width: number;
  height: number;
  cx: number;     // Center X
  cy: number;     // Center Y
}

export type BoardGeometry = Record<number, PointGeometry>;

/**
 * useBoardGeometry
 * 
 * Measures the actual DOM elements of the board (points, bar, off-tray)
 * to provide a source of truth for checker positioning.
 */
export function useBoardGeometry(
  containerRef: React.RefObject<HTMLDivElement | null>,
  dimensions: BoardDimensions
) {
  const [geometry, setGeometry] = useState<BoardGeometry>({});

  const measureFunctions = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elements = container.querySelectorAll('[data-point-id]');
    
    // Get Border Widths individually to adjust relative position
    const style = window.getComputedStyle(container);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;

    const newGeometry: BoardGeometry = {};

    elements.forEach((el) => {
      const pointId = parseInt(el.getAttribute('data-point-id') || '', 10);
      if (isNaN(pointId)) return;

      const rect = el.getBoundingClientRect();

      // Calculate relative position to the container's *padding box*
      const relX = rect.left - containerRect.left - borderLeft;
      const relY = rect.top - containerRect.top - borderTop;

      newGeometry[pointId] = {
        x: relX,
        y: relY,
        width: rect.width,
        height: rect.height,
        cx: relX + rect.width / 2,
        cy: relY + rect.height / 2
      };
    });

    setGeometry(newGeometry);
  }, [containerRef]); // Removed dimensions (not used in body)

  // Use useEffect instead of useLayoutEffect to avoid synchronous setState warnings
  // and handle potential paint timing issues better in React 19 strict mode.
  useEffect(() => {
    // Wrap in RAF to ensure layout is settled and avoid forced reflow within render cycle
    const rafId = requestAnimationFrame(() => {
       measureFunctions();
    });
    return () => cancelAnimationFrame(rafId);
  }, [measureFunctions, dimensions]); // Trigger on dimensions change

  return { geometry, measureBoard: measureFunctions };
}
