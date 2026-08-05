import { useEffect, useRef, useState } from 'react';
import { Mic, Video, Phone, MicOff, VideoOff, XOctagon } from 'lucide-react';

interface VideoChatProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionStatus: RTCPeerConnectionState;
  startCall: () => void;
  toggleAudio?: (enabled: boolean) => void;
  toggleVideo?: (enabled: boolean) => void;
  stopAllTracks?: () => void;
  hangUp?: () => void;
  disabled?: boolean;
}

export function VideoChat({ 
  localStream, 
  remoteStream, 
  connectionStatus, 
  startCall,
  toggleAudio,
  toggleVideo,
  stopAllTracks,
  hangUp,
  disabled = false
}: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const isInCall = connectionStatus === 'connected' || connectionStatus === 'connecting';

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleToggleMic = () => {
      const newState = !isMuted;
      setIsMuted(newState);
      toggleAudio?.(!newState);
  };

  const handleToggleVideo = () => {
      const newState = !isVideoOff;
      setIsVideoOff(newState);
      toggleVideo?.(!newState);
  };

  const handleRevoke = () => {
      stopAllTracks?.();
      // Optional: Visual confirmation or state update
  };
  
  if (disabled) {
      return null;
  }

  if (!localStream && connectionStatus === 'new') {
      // Show start button or "Camera Access" state
      // This handles the "Revoked" state too (localStream becomes null)
      return (
        <div className="fixed bottom-4 right-4 z-50 w-48 h-36 rounded-xl bg-black/80 border border-white/10 flex items-center justify-center p-3 text-center">
          <span className="text-[10px] uppercase font-bold text-white/50 tracking-widest leading-tight">
            Esperando sala...
          </span>
        </div>
      );
  }

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {/* Remote Video (Main) */}
      <div className="relative w-48 h-36 bg-black/80 rounded-xl overflow-hidden shadow-2xl border border-white/10 group">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Waiting...'}
            </span>
          </div>
        )}
        {/* Connection status badge (Fase 1 videoconferencia) */}
        <div className={`absolute bottom-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
          connectionStatus === 'connected'
            ? 'bg-emerald-500/80 text-black'
            : connectionStatus === 'connecting'
            ? 'bg-amber-500/80 text-black animate-pulse'
            : 'bg-white/15 text-white/60'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            connectionStatus === 'connected' ? 'bg-black' : 'bg-current'
          }`} />
          {connectionStatus === 'connected' ? 'Rival' : connectionStatus === 'connecting' ? 'Conectando' : 'Esperando'}
        </div>
        
        {/* Revoke Button (Privacy P0) - Visible on Hover */}
        <button 
            onClick={handleRevoke}
            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Revocar Acceso (Stop Camera)"
        >
            <XOctagon size={12} />
        </button>
      </div>

      {/* Local Video (PiP) */}
      {/* ... */}
      <div className="absolute bottom-24 right-2 w-16 h-12 bg-black rounded-lg overflow-hidden border border-white/20 shadow-lg">
        { localStream ? (
            <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover scale-x-[-1] transition-opacity ${isVideoOff ? 'opacity-0' : 'opacity-100'}`} 
            />
        ) : (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                <VideoOff size={16} className="text-white/20" />
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/60 backdrop-blur-md rounded-full p-2 flex items-center justify-center gap-4 border border-white/10">
        <button 
            onClick={handleToggleMic}
            className={`text-white hover:text-cyan-400 transition-colors ${isMuted ? 'text-red-500' : ''}`}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        
        <button 
          onClick={isInCall ? () => hangUp?.() : startCall} // Colgar si en llamada, si no llamar
          title={isInCall ? 'Colgar llamada (la partida sigue)' : 'Llamar'}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center transition-all
            ${isInCall ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
          `}
        >
          <Phone size={14} className="text-white fill-current" />
        </button>

        <button 
            onClick={handleToggleVideo}
            className={`text-white hover:text-cyan-400 transition-colors ${isVideoOff ? 'text-red-500' : ''}`}
        >
          {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />}
        </button>
      </div>
    </div>
  );
}
