import { useRef, useEffect, useState } from 'react';
import { useScroll, useTransform } from 'framer-motion';

const FRAME_COUNT = 192;

export function BackgammonScroll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>(new Array(FRAME_COUNT).fill(null));
  // We no longer block on "isLoading" related to ALL images.
  // We only care if the first image is ready to render.
  const [isReady, setIsReady] = useState(false);

  // Hook into scroll progress (0 to 1)
  const { scrollYProgress } = useScroll();
  
  // Transform scroll progress to frame index (0 to FRAME_COUNT - 1)
  const frameIndex = useTransform(scrollYProgress, [0, 1], [0, FRAME_COUNT - 1]);

  useEffect(() => {
    // 1. Load the first image IMMEDIATELY to show something
    const firstImg = new Image();
    firstImg.src = `/backgammon_sequence/00001.jpg`;
    firstImg.onload = () => {
      setImages(prev => {
        const newImages = [...prev];
        newImages[0] = firstImg;
        return newImages;
      });
      setIsReady(true); // Unblock UI immediately
    };

    // 2. Load the rest in the background without blocking
    const backgroundImages: HTMLImageElement[] = new Array(FRAME_COUNT).fill(null);
    backgroundImages[0] = firstImg; // Keep reference

    // Helper to load a specific index
    const loadImage = (i: number) => {
        const img = new Image();
        const fileName = (i + 1).toString().padStart(5, '0') + '.jpg';
        img.src = `/backgammon_sequence/${fileName}`;
        img.onload = () => {
             setImages(prev => {
                 // Optimization: Only update state in chunks or check? 
                 // React might batch this, but 192 updates is a lot.
                 // Better: mutate a local ref for rendering, or just let React handle it.
                 // For safety + React strictness, we update state.
                 const next = [...prev];
                 next[i] = img;
                 return next;
             });
        };
        // No error handling needed for background load, just won't show
    };

    // Start loading the rest
    for (let i = 1; i < FRAME_COUNT; i++) {
        // Stagger slightly if needed, but browser handles concurrency well enough for cached assets
        // Adding a tiny delay to give main thread breathing room for hydration
        setTimeout(() => loadImage(i), 100); 
    }

  }, []);

  /**
   * Render loop: Sync canvas to current frame index
   */
  useEffect(() => {
    if (!isReady) return;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Get current frame index from MotionValue
      let index = Math.round(frameIndex.get());
      if (index < 0) index = 0;
      if (index >= FRAME_COUNT) index = FRAME_COUNT - 1;

      // Get image at index OR fallback to first image (or nearest loaded?)
      // Simplest fallback: If frame X isn't loaded, text/blank is bad.
      // Better: Show images[0] (static bg) if scrolling fast before load.
      let img = images[index];
      if (!img) {
          // Find nearest loaded frame? Too expensive to search 192 array every frame.
          // Just fallback to first frame which we GUARANTEE is loaded.
           img = images[0];
      }

      if (img) {
        // High-DPI screen handling
        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        }

        // Draw Image - Contain Fit
        try {
            const imgRatio = img.width / img.height;
            const screenRatio = width / height;

            let drawWidth, drawHeight, offsetX, offsetY;

            if (screenRatio > imgRatio) {
                // Screen is wider -> constrain by height
                drawHeight = height;
                drawWidth = height * imgRatio;
                offsetX = (width - drawWidth) / 2;
                offsetY = 0;
            } else {
                // Screen is taller -> constrain by width
                drawWidth = width;
                drawHeight = width / imgRatio;
                offsetX = 0;
                offsetY = (height - drawHeight) / 2;
            }

            // Only clear if dimensions changed (optimized?) No, must clear for transp/artifacts
            // Actually ctx.drawImage covers it if opaque? Images are JPEGs (opaque).
            // But aspect ratio fill leaves black bars. Clear is safer.
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        } catch {
            // silent ignore
        }
      }
    };

    // Listen to MotionValue changes and re-render
    const unsubscribe = frameIndex.on("change", () => {
        requestAnimationFrame(render);
    });
    
    // Initial render
    requestAnimationFrame(render);
    
    // Resize listener 
    window.addEventListener('resize', render);

    return () => {
       unsubscribe();
       window.removeEventListener('resize', render);
    };
  }, [isReady, images, frameIndex]);

  // If not even first image is ready, show nothing (or a tiny spinner/black bg)
  // But DO NOT block the rest of the page content (which lives in LandingPage.tsx above this)
  if (!isReady) {
      return <div className="fixed inset-0 bg-black z-0" />;
  }

  return (
    <div className="relative w-full h-[400vh]"> {/* Total scroll height */}
      <div className="sticky top-0 w-full h-screen overflow-hidden">
        <canvas 
            ref={canvasRef} 
            className="w-full h-full block"
            style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
