import { useState, useCallback, useRef } from 'react';

export interface BoardGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * useBoardGeometry Hook
 * Accurately tracks the board's screen position for 1:1 hand mapping.
 * Uses Callback Ref pattern to ensure observers are attached immediately when DOM is ready.
 */
export function useBoardGeometry() {
  const [geometry, setGeometry] = useState<BoardGeometry | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  
  // Measurement logic
  const updateGeometry = useCallback(() => {
    // We need the element. Since we are in a callback ref, we might need to store the element in a ref too
    // checking logic below in measureElement
  }, []);

  // Clean up existing observers
  const cleanup = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    window.removeEventListener('scroll', updateGeometry);
    window.removeEventListener('resize', updateGeometry);
  }, [updateGeometry]);

  // Callback Ref: React calls this when the node is added/removed
  const boardRef = useCallback((node: HTMLDivElement | null) => {
    // 1. Cleanup previous
    cleanup();

    if (!node) return;

    // 2. Define measurement function scoped to this node
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setGeometry(prev => {
        if (
          prev &&
          Math.abs(prev.top - rect.top) < 1 &&
          Math.abs(prev.left - rect.left) < 1 &&
          Math.abs(prev.width - rect.width) < 1 &&
          Math.abs(prev.height - rect.height) < 1
        ) {
          return prev;
        }
        return {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      });
    };

    // 3. Setup ResizeObserver
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    
    observer.observe(node);
    observerRef.current = observer;

    // 4. Setup Window Listeners
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure, { passive: true });

    // 5. Initial measurement
    measure();

  }, [cleanup]);

  return { boardRef, geometry };
}
