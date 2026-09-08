import { useEffect, useRef, useState } from 'react';

/**
 * Scroll reveal — IntersectionObserver-based progressive reveal.
 * Usage:
 *   const [ref, isVisible] = useScrollReveal<HTMLDivElement>();
 *   <div ref={ref} className={isVisible ? 'is-visible' : ''}>…
 *
 * Falls back to visible-on-mount when IntersectionObserver is unavailable
 * (so content is never accidentally hidden).
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.1
) {
  const ref = useRef<T>(null);
  const supportsIO = typeof IntersectionObserver !== 'undefined';
  const [isVisible, setIsVisible] = useState(!supportsIO);

  useEffect(() => {
    const node = ref.current;
    if (!node || !supportsIO) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, supportsIO]);

  return [ref, isVisible] as const;
}
