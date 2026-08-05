import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useCamera } from '../lib/useCamera';
import { useSharedMediaPipe } from '../lib/useSharedMediaPipe';
import { useCalibrationSync } from '../lib/useCalibrationSync';
import { solveHomography, computeReprojectionError } from '../lib/homography';
import { Check, RotateCcw, X } from 'lucide-react';
import { Toast } from '../../../shared/ui/Toast';

interface Point {
  x: number;
  y: number;
}

interface BoardGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CalibrationOverlayProps {
  onClose: () => void;
  onCalibrate?: (points: Point[]) => void; // Optional, legacy support
  boardGeometry?: BoardGeometry; // Board dimensions from parent
}

const DEFAULT_CORNERS: Point[] = [
  { x: 0.1, y: 0.1 }, // TL
  { x: 0.9, y: 0.1 }, // TR
  { x: 0.9, y: 0.9 }, // BR
  { x: 0.1, y: 0.9 }, // BL
];

type CalibrationStep = 'board' | 'success';

export function CalibrationOverlay({ onClose, onCalibrate, boardGeometry }: CalibrationOverlayProps) {
  const { videoRef, isLoading, stream, startCamera, stopCamera } = useCamera({ shared: true });
  const { setCalibrationPoints, startDetection, stopDetection, setHandCalibration } = useSharedMediaPipe();
  const { saveCalibration, isRegisteredUser } = useCalibrationSync();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showToast, setShowToast] = useState(false);
  const [step, setStep] = useState<CalibrationStep>('board');

  // Reusa la cámara ÚNICA de la app (no un segundo getUserMedia → evita
  // "cámara en uso" en móvil) y la adquiere al montar / libera al desmontar.
  useEffect(() => {
    startCamera().catch(console.error);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect video to MediaPipe detection when ready (use ref to prevent infinite loop)
  const detectionStartedRef = useRef(false);
  
  useEffect(() => {
    if (!isLoading && videoRef.current && stream && !detectionStartedRef.current) {
      detectionStartedRef.current = true;
      // Start MediaPipe detection with this video element
      startDetection(videoRef.current);
    }
    
    // Cleanup: stop detection when component unmounts
    return () => {
      if (detectionStartedRef.current) {
        detectionStartedRef.current = false;
        stopDetection();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, stream]);


  // --- Board Calibration State ---
  const [corners, setCorners] = useState<Point[]>(() => {
    const saved = localStorage.getItem('vivo_calibration_v3');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Version check
        if (data.version === 1 && Array.isArray(data.corners)) {
          return data.corners;
        }
      } catch {
        // Invalid data
      }
    }
    return DEFAULT_CORNERS;
  });

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // --- Step 1: Board Interaction ---
  const handleMouseMove = (e: React.MouseEvent) => {
    if (step !== 'board') return; // Only allow corner drag in board step
    if (draggingIdx === null || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Clamp 0-1
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    
    setCorners(prev => {
      const next = [...prev];
      next[draggingIdx] = { x: clampedX, y: clampedY };
      return next;
    });
  };

  // Compute quality score
  const qualityData = useMemo(() => {
    if (!boardGeometry || boardGeometry.width === 0) {
      return { error: Infinity, quality: 'unknown' as const, color: 'gray' };
    }

    const dstPoints: Point[] = [
      { x: boardGeometry.left, y: boardGeometry.top },
      { x: boardGeometry.left + boardGeometry.width, y: boardGeometry.top },
      { x: boardGeometry.left + boardGeometry.width, y: boardGeometry.top + boardGeometry.height },
      { x: boardGeometry.left, y: boardGeometry.top + boardGeometry.height }
    ];

    const transform = solveHomography(corners, dstPoints);
    const error = computeReprojectionError(corners, dstPoints, transform);

    let quality: 'excellent' | 'good' | 'poor' | 'unknown';
    let color: string;

    if (error < 15) {
      quality = 'excellent';
      color = 'green';
    } else if (error < 30) {
      quality = 'good';
      color = 'yellow';
    } else {
      quality = 'poor';
      color = 'red';
    }

    return { error, quality, color };
  }, [corners, boardGeometry]);

  // --- Hand Calibration State (Zero-Offset Strategy) ---
  const isRightHand = true; 
  const [calibratedHands, setCalibratedHands] = useState<Set<string>>(new Set());

  // --- Final Save ---
  const finishCalibration = useCallback(async () => {
    if (!boardGeometry || boardGeometry.width === 0) {
      alert('Board not detected. Please ensure the game board is visible.');
      return;
    }

    // Zero-Offset Strategy: User confirmed default tracking is better.
    // We use this step only for VERIFICATION, not to introduce new offsets.
    const offset = { x: 0, y: 0 }; 
    
    // Capture Calibration Data
    // We calculate the offset of the Index Finger (8) relative to the Wrist (0)
    // This allows us to know "where point 8 is" relative to the hand anchor
    
    // For simplicity in this v1: We just save settings
    const handData = {
        isRightHand,
        scale: 1, // Default scale
        offset: offset, 
        rotation: 0
    };

    setCalibrationPoints(corners);
    setHandCalibration(handData);

    // Update calibrated hands set
    const currentHand = isRightHand ? 'right' : 'left';
    const newCalibratedHands = new Set(calibratedHands);
    newCalibratedHands.add(currentHand);
    setCalibratedHands(newCalibratedHands);

    // Save to Supabase (registered users) or localStorage (anonymous)
    const calibrationData = {
        version: 1,
        corners,
        timestamp: Date.now(),
        quality: qualityData.quality,
        error: qualityData.error,
        handCalibration: handData,
        calibratedHands: Array.from(newCalibratedHands)
    };
    
    await saveCalibration(calibrationData);
    
    // Legacy support
    onCalibrate?.(corners);

    setShowToast(true);
    setStep('success');
    
    // Reset completion for next time (even though unused) here just in case logic is kept, but it's removed.
    
    // SIMPLIFICATION: We only require one hand calibration.
    // The offset is largely systematic (Z-depth/Perspective), so we apply it globally.
    // We don't force the user to do the other hand.
    
    setTimeout(() => {
       onClose();
    }, 1500); // Faster close

  }, [boardGeometry, isRightHand, corners, qualityData, setCalibrationPoints, setHandCalibration, saveCalibration, onCalibrate, onClose, calibratedHands]);
  
  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1E1E1E] sm:bg-[#1E1E1E]/95 sm:backdrop-blur-md"
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDraggingIdx(null)}
    >
      {/* Container: Full screen on mobile, limited aspect ratio on desktop */}
      <div className="relative w-full h-full sm:h-auto sm:max-w-5xl sm:aspect-video bg-black sm:rounded-3xl overflow-hidden border-none sm:border border-white/10 shadow-2xl flex flex-col">

        
        {/* Camera Feed (Always visible in bg) */}
        <div className="absolute inset-0">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
          )}
          
          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover opacity-50 scale-x-[-1]" 
          />
        </div>

        {/* --- HEADER --- */}
        <div className="relative z-10 flex justify-between items-start p-4 sm:p-6 md:p-8 pb-2 sm:pb-4">
          <div className="text-left">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">
                {step === 'board' && 'Calibrar Tablero'}
                {step === 'success' && '¡Listo!'}
            </h2>
            <p className="text-white/60 font-medium mt-1 sm:mt-2 text-sm sm:text-base">
                {step === 'board' && 'Ajusta las 4 esquinas al tablero real.'}
                {step === 'success' && 'Configuración guardada correctamente.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 sm:p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="text-white" size={20} />
          </button>
        </div>

        {/* --- CONTENT AREA --- */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center pt-0 w-full h-full">
            
            {/* STEP 1: BOARD ALIGNMENT */}
            {step === 'board' && (
                <div className="w-full h-full p-8 sm:p-12 relative"> {/* Added padding for handles */}
                  <div 
                    ref={containerRef}
                    className="w-full h-full border-2 border-cyan-500/30 border-dashed rounded-none relative bg-cyan-500/5 select-none z-0"
                  >
                    {/* Corner Handles */}
                    {[0, 1, 2, 3].map((i) => (
                      <div 
                        key={i}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingIdx(i);
                        }}
                        className={`
                          absolute w-10 h-10 rounded-full border-4 border-black cursor-grab active:cursor-grabbing hover:scale-110 transition-transform shadow-2xl z-30
                          ${draggingIdx === i ? 'bg-cyan-400 scale-125' : 'bg-cyan-600'}
                        `}
                        style={{
                          top: corners[i] ? `${corners[i].y * 100}%` : '0%',
                          left: corners[i] ? `${corners[i].x * 100}%` : '0%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-black">
                          {i + 1}
                        </div>
                      </div>
                    ))}
                    
                    {/* Visual Guide REMOVED to avoid confusion (the "second box") */}
                  </div>

                  <div className="absolute bottom-4 left-0 right-0 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 pointer-events-auto z-50 p-4">
                     <button 
                        onClick={() => setCorners(DEFAULT_CORNERS)}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition-all text-white/80 text-sm sm:text-base cursor-pointer"
                      >
                        <RotateCcw size={16} className="inline mr-2" /> Reset
                     </button>
                     <button 
                        onClick={finishCalibration}
                        className="px-6 sm:px-10 py-2 sm:py-3 bg-cyan-500 text-black rounded-xl font-black uppercase hover:scale-105 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] text-sm sm:text-base cursor-pointer"
                     >
                        Guardar <Check size={18} className="inline ml-2" />
                     </button>
                  </div>
                </div>
            )}


            
            {/* STEP 4: SUCCESS */}
             {step === 'success' && (
                <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.6)]">
                        <Check size={48} className="text-black" strokeWidth={4} />
                    </div>
                    <h3 className="text-4xl font-black text-white uppercase">¡Todo Listo!</h3>
                    <p className="text-white/60">Guardando configuración...</p>
                </div>
             )}
        </div>
      </div>
      
      {showToast && (
        <Toast
          message={isRegisteredUser 
            ? "✅ Calibración sincronizada" 
            : "✅ Calibración guardada localmente"}
          type="success"
          duration={3000}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
