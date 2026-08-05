import React, { useEffect, useRef } from 'react';

interface VideoLayerProps {
  stream: MediaStream | null;
  className?: string; // Allow external styling (z-index, etc.)
  metrics?: { fps: number; packetLoss: number; rtt: number }; // New Prop
}

/**
 * VideoLayer: The base of the "Crystal Window".
 * Renders the remote peer's video stream.
 * 
 * - Ensures object-fit: cover to fill the screen (like a window).
 * - Handles mirroring if needed (though usually remote is NOT mirrored, local IS).
 * - Optimized for low latency.
 * - [NEW] Graceful Degradation: Shows warning if connection is poor.
 */
export const VideoLayer: React.FC<VideoLayerProps> = ({ stream, className, metrics }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simple Quality Heuristic
  const isPoorConnection = metrics && (metrics.fps < 10 || metrics.packetLoss > 5 || metrics.rtt > 200);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    // Render status based on connection
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-black/80 ${/*statusColor*/ ''} ${className}`}>
        {/* Simplified: Removed status text for cleaner UI */}
        {/* 
            TODO: Restore status text later when needed for 2-player game loop fix
            const statusText = connectionStatus === 'connected' ? 'Connected (No Video)' : 'Waiting for connection...';
            const statusColor = connectionStatus === 'connected' ? 'text-emerald-500/50' : 'text-white/50';
        */}
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Fase 1 videoconferencia: el audio del rival SÍ se oye (el VideoChat
        // miniatura se desmonta al iniciarse la partida; el fondo toma su rol).
        // Desactivar: quitar 'autoPlay' haría que el video requiera interacción.
        className={`w-full h-full object-cover transition-opacity duration-500 ${isPoorConnection ? 'opacity-50 blur-sm' : 'opacity-100'}`}
        style={{
           // Transform: scaleX(-1) if we wanted to mirror remote, but usually we don't.
           // We only mirror LOCAL video (self-view).
           // So this is standard.
        }}
      />
      
      {/* Fallback / Warning Overlay */}
      {isPoorConnection && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/80 text-white px-4 py-2 rounded-full text-xs font-bold animate-pulse backdrop-blur-md z-50">
           ⚠️ POOR CONNECTION (RTT: {metrics.rtt.toFixed(0)}ms)
        </div>
      )}
    </div>
  );
};
