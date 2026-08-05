import { useEffect, useState, useRef } from 'react';
import { useCamera } from '../lib/useCamera';
import { useSharedMediaPipe } from '../lib/useSharedMediaPipe';
import { HandDebug } from './HandDebug';
import { AlertCircle, X, AlertTriangle } from 'lucide-react';
import { isFeatureEnabled } from '../../../shared/lib/featureFlags';

interface HandTrackingLayerProps {
  onReady: () => void;
  gesture: string;
  isHandActive: boolean;
  showVideo?: boolean; // Control Video rendering
  showOverlay?: boolean; // Control Overlay (Debug/Cursor) rendering
  cursor?: { x: number, y: number } | null;
  // Drift detection
  shouldPromptRecalibration?: boolean;
  onRecalibrate?: () => void;
  // Feature Flag: Smart Tracking
  isActive?: boolean; 
  mirrored?: boolean; // mirror video for selfie-style UX
  useSharedCamera?: boolean; // reuse the app-wide camera (video call) to avoid contention
}

/**
 * HandTrackingLayer
 * The visual and logical container for the MediaPipe feature.
 * Renders the camera feed, the debug overlay, and manages the detection loop.
 */
export function HandTrackingLayer({ 
  onReady, 
  gesture, 
  isHandActive,
  showVideo = true,
  showOverlay = true,
  cursor,
  shouldPromptRecalibration = false,
  onRecalibrate,
  isActive = true, // Default to true if not provided
  mirrored = true // Default selfie mirror for front camera UX
, useSharedCamera = false
}: HandTrackingLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Smart Tracking Logic
  // If feature enabled, use isActive prop. Else always active.
  const shouldTrack = isFeatureEnabled('ENABLE_SMART_TRACKING') ? isActive : true;
  const [errorDismissed, setErrorDismissed] = useState(false);
  
  // 1. Camera Management
  const { 
    videoRef: cameraVideoRef, 
    error: cameraError, 
    warning: cameraWarning,
    isLoading: cameraLoading,
    startCamera,
    stopCamera
  } = useCamera(useSharedCamera ? { shared: true } : {});

  // 3. Shared MediaPipe Context
  const { 
    startDetection, 
    landmarks, 
    isModelLoading, 
    error: mlError,
    videoDimensions // Get the robust dimensions
  } = useSharedMediaPipe();

  // Start camera when layer is active and video is enabled
  useEffect(() => {
    if (isActive) {
      startCamera().catch(console.error);
    }
    return () => {
      if (isActive) {
        stopCamera();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Initialize Camera & Model (Centralized)
  useEffect(() => {
    // Only verify readiness, do not start if already running
    if (!isModelLoading && !cameraLoading) {
        onReady();
    }
  }, [isModelLoading, cameraLoading, onReady]);

  // 2. Responsive Size Handling (Debounced)
  const lastAspect = useRef<number>(0);
  
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const updateSize = () => {
       if (containerRef.current) {
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          
          setContainerSize({ width: w, height: h });
          
          // Smart Restart Logic: Only if Aspect Ratio "Flips" (Landscape <-> Portrait)
          // This prevents restarting on small browser bar movements
          const newAspect = w / h;
          if (lastAspect.current !== 0) {
              const wasLandscape = lastAspect.current > 1;
              const isLandscape = newAspect > 1;
              
              if (wasLandscape !== isLandscape && showVideo) {
                 // Orientation changed - Force tracking reset if needed
                 // Actually, useCamera usually handles stream, but we might want to 
                 // re-trigger something here. For now, just logging or updating state is enough
                 // as useHandInteraction uses these new dimensions immediately.
              }
          }
          lastAspect.current = newAspect;
       }
    };
    
    // Initial measure
    updateSize();

    const handleResize = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(updateSize, 200); // 200ms Debounce
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize); // Specific mobile event
    
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        clearTimeout(timeoutId);
    };
  }, [showVideo]);

  // DERIVED DIMENSIONS for Debug Overlay
  // Prefer video source dimensions (Canvas = Video) logic.
  // Fallback to container size if video not ready.
  const debugWidth = videoDimensions?.width || containerSize.width;
  const debugHeight = videoDimensions?.height || containerSize.height;

  // Handle Video Element Ref (Pass to Context)
  useEffect(() => {
    if (showVideo && cameraVideoRef.current) {
        // Ensure webkit-playsinline for iOS
        cameraVideoRef.current.setAttribute('webkit-playsinline', 'true');
        cameraVideoRef.current.setAttribute('playsinline', 'true');
        
        // Start MediaPipe detection on the video element
        if (cameraVideoRef.current.readyState >= 2) {
             startDetection(cameraVideoRef.current);
        } else {
             cameraVideoRef.current.onloadeddata = () => {
                 if (cameraVideoRef.current) startDetection(cameraVideoRef.current);
             };
        }
    }
  }, [startDetection, showVideo, cameraVideoRef, cameraLoading]);

  if ((mlError || cameraError) && !errorDismissed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-40 rounded-3xl border border-red-500/30">
        <div className="text-center p-6 relative max-w-sm">
          <button 
            onClick={() => setErrorDismissed(true)}
            className="absolute -top-2 -right-2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
          >
             <X className="w-5 h-5 text-white" />
          </button>
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Error de Hardware</h3>
          <p className="text-white/60 text-sm mb-6">{mlError || cameraError}</p>
          <button
             onClick={() => setErrorDismissed(true)}
             className="px-6 py-2 bg-red-400 hover:bg-red-500 text-black font-bold rounded-xl transition-colors cursor-pointer uppercase text-sm"
          >
             Continuar sin hardware
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-transparent">
      {/* 1. Camera Feed (Background) */}
      {showVideo && (
        <video 
          ref={cameraVideoRef}
          className={`absolute inset-0 w-full h-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
          playsInline
          muted
          autoPlay
        />
      )}

      {/* 2. Hand Skeleton Debug (Overlay) - ONLY IF ACTIVE */}
      {showOverlay && shouldTrack && (
        <HandDebug 
          landmarks={landmarks} 
          width={debugWidth} 
          height={debugHeight} 
          gesture={gesture}
          showCursor={!cursor} // Only show debug cursor if no logical cursor provided
        />
      )}

{/* 3. Logical Interaction Cursor (DOM-based for perfect alignment) - ONLY IF ACTIVE */}
      {/* HOLOGRAPHIC HAND EFFECT - Iron Man Repulsor Glow */}
      {showOverlay && cursor && shouldTrack && (
        <div 
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-[60] flex items-center justify-center"
          style={{
            left: cursor.x,
            top: cursor.y,
          }}
        >
          {/* Outer Glow Ring */}
          <div 
            className={`absolute w-16 h-16 rounded-full animate-ping opacity-40 ${
              gesture === 'pinch' 
                ? 'bg-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.8)]' 
                : 'bg-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.8)]'
            }`}
          />
          {/* Middle Glow */}
          <div 
            className={`absolute w-12 h-12 rounded-full animate-pulse opacity-60 ${
              gesture === 'pinch' 
                ? 'bg-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.6)]' 
                : 'bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.6)]'
            }`}
          />
          {/* Inner Core */}
          <div 
            className="relative w-6 h-6 rounded-full border-2 shadow-[0_0_10px_rgba(0,0,0,0.5)] flex items-center justify-center transition-colors duration-200"
            style={{
              backgroundColor: gesture === 'pinch' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)',
              borderColor: '#ffffff' 
            }}
          >
            <div className={`w-2 h-2 rounded-full bg-white ${gesture === 'pinch' ? 'scale-125' : 'scale-100'}`} />
          </div>
        </div>
      )}

      {/* Tracking Loss Indicator (Spec §6C) - ONLY IF ACTIVE AND EXPECTING HAND */}
      {showOverlay && !isHandActive && !isModelLoading && shouldTrack && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500/90 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse z-50 pointer-events-none">
           ⚠️ Sin detección de mano
        </div>
      )}

      {/* Virtual Camera Warning Indicator */}
      {showOverlay && cameraWarning && shouldTrack && !cameraError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-4 py-2 rounded-full font-medium text-xs shadow-lg z-50 flex items-center gap-2 pointer-events-none">
           <AlertTriangle size={14} className="text-blue-200" />
           {cameraWarning}
        </div>
      )}

      {/* Drift Warning Banner */}
      {showOverlay && shouldPromptRecalibration && onRecalibrate && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/95 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-2xl z-50 flex items-center gap-4">
          <span>⚠️ Deriva de detección detectada. Por favor recalibra la cámara.</span>
          <button 
            onClick={onRecalibrate}
            className="px-4 py-1 bg-white text-red-600 rounded-lg font-black uppercase text-xs hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Recalibrar Ahora
          </button>
        </div>
      )}

      {/* Loading States */}
      {isModelLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="flex flex-col items-center gap-4">
             <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
             <span className="text-cyan-400 font-mono text-sm animate-pulse">
               CARGANDO MODELO...
             </span>
          </div>
        </div>
      )}
    </div>
  );
}
