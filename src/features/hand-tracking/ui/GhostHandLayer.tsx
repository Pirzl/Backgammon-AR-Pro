import React, { useEffect, useState, useRef } from 'react';
import { decodeHandFrame, type HandFrame } from '../lib/HandProtocol';
// import { useBoardDimensions } from '../../game-board/lib/useBoardDimensions'; // UNUSED

interface GhostFrame extends HandFrame {
  renderTime: number; // When we received it locally
}

export const GhostHandLayer: React.FC = () => {
    const [frame, setFrame] = useState<GhostFrame | null>(null);
    const frameRef = useRef<GhostFrame | null>(null); // NEW: Access fresh data in loop
    
    // const { dimensions } = useBoardDimensions(); // UNUSED
    const requestRef = useRef<number | null>(null); // FIXED: Initial value
    
    // Interpolation State
    const targetPos = useRef({ x: 0.5, y: 0.5 });
    const currentPos = useRef({ x: 0.5, y: 0.5 });
    
    useEffect(() => {
        const handleData = (e: Event) => {
            const customEvent = e as CustomEvent<unknown>;
            const data = customEvent.detail;
            
            const decoded = decodeHandFrame(data);
            if (decoded) {
                const newFrame = { ...decoded, renderTime: performance.now() };
                setFrame(newFrame);
                frameRef.current = newFrame; // Keep ref in sync
                targetPos.current = { x: decoded.x, y: decoded.y };
            }
        };

        window.addEventListener('vivo-data-message', handleData);
        return () => window.removeEventListener('vivo-data-message', handleData);
    }, []);

    useEffect(() => {
        // Animation Loop for LERP
        const animate = () => {
            // LERP factor (Tune for smoothness vs latency)
            const alpha = 0.15; 
            
            currentPos.current.x += (targetPos.current.x - currentPos.current.x) * alpha;
            currentPos.current.y += (targetPos.current.y - currentPos.current.y) * alpha;
            
            // Direct DOM update for perf
            const cursor = document.getElementById('ghost-cursor');
            if (cursor) {
                // Map 0-1 to Window Dimensions (Full Screen Overlay)
                const sx = currentPos.current.x * window.innerWidth;
                const sy = currentPos.current.y * window.innerHeight;

                cursor.style.transform = `translate(${sx}px, ${sy}px)`;
                
                // Visuals based on Gesture (Read from Ref)
                if (frameRef.current) {
                    const isPinch = frameRef.current.g === 1;
                    cursor.style.backgroundColor = isPinch ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 255, 255, 0.5)';
                    cursor.style.scale = isPinch ? '0.8' : '1.0';
                }
            }
            
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };

    }, []); // Run once!

    if (!frame) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            <div 
                id="ghost-cursor"
                className="absolute w-8 h-8 rounded-full border-2 border-white shadow-[0_0_15px_rgba(0,255,255,0.8)] transition-colors duration-200"
                style={{
                    top: 0,
                    left: 0,
                    willChange: 'transform'
                }}
            >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-cyan-200 font-mono whitespace-nowrap bg-black/50 px-2 rounded">
                    OPPONENT
                </div>
            </div>
        </div>
    );
};
