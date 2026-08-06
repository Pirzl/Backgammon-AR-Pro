import { useState } from 'react';
import { Mic, Video, Phone, MicOff, VideoOff } from 'lucide-react';

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

/**
 * VideoChat — Controls-only bar for the H2H video call.
 *
 * No foreground video streams are rendered here. The remote peer's video
 * is displayed exclusively in the background via VideoLayer (Crystal Window).
 * The own camera feeds the hand tracking invisibly via HandTrackingLayer.
 *
 * This component renders only: Mic toggle, Video toggle, Call/Hang-up.
 */
export function VideoChat({ 
  connectionStatus, 
  startCall,
  toggleAudio,
  toggleVideo,
  hangUp,
  disabled = false
}: VideoChatProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const isInCall = connectionStatus === 'connected' || connectionStatus === 'connecting';

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
  
  if (disabled) {
      return null;
  }

  return (
    <div className="flex items-center gap-2 shadow-2xl">
      {/* Connection status pill */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider select-none backdrop-blur-md shadow-md border ${
        connectionStatus === 'connected'
          ? 'bg-emerald-500/90 text-black border-emerald-400/50'
          : connectionStatus === 'connecting'
          ? 'bg-amber-500/90 text-black border-amber-400/50 animate-pulse'
          : connectionStatus === 'closed'
          ? 'bg-rose-600/90 text-white border-rose-500/50'
          : 'bg-zinc-900/80 text-zinc-300 border-white/10'
      }`}>
        <span className={`w-2 h-2 rounded-full ${
          connectionStatus === 'connected' ? 'bg-black' : 'bg-current'
        }`} />
        {connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'connecting' ? 'Conectando' : connectionStatus === 'closed' ? 'Cortado' : 'Esperando'}
      </div>

      {/* Controls */}
      <div className="bg-zinc-900/90 backdrop-blur-md rounded-full px-3.5 py-1.5 flex items-center justify-center gap-3 border border-white/15 shadow-xl">
        <button 
            onClick={handleToggleMic}
            className={`p-1.5 rounded-full transition-all cursor-pointer hover:bg-white/10 ${isMuted ? 'text-rose-400 hover:text-rose-300' : 'text-zinc-200 hover:text-cyan-400'}`}
            title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        >
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        
        <button 
          onClick={isInCall ? () => hangUp?.() : startCall}
          title={isInCall ? 'Colgar llamada (la partida sigue)' : 'Llamar'}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95
            ${isInCall ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}
          `}
        >
          <Phone size={14} className="text-white fill-current" />
        </button>

        <button 
            onClick={handleToggleVideo}
            className={`p-1.5 rounded-full transition-all cursor-pointer hover:bg-white/10 ${isVideoOff ? 'text-rose-400 hover:text-rose-300' : 'text-zinc-200 hover:text-cyan-400'}`}
            title={isVideoOff ? 'Activar cámara' : 'Apagar cámara'}
        >
          {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
      </div>
    </div>
  );
}
