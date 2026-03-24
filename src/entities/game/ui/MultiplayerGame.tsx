import { useMemo, useRef, useEffect } from 'react';
import { GameBoard } from '../../../features/game-board/ui/GameBoard';
import { useSupabaseRealtime, useGameSync, VideoChat, RemoteCursorOverlay } from '../../../features/networking';
import type { GamePayload, MoveData, SignalPayload } from '../../../features/networking/types/gamestate';
import type { SignalData } from '../../../features/networking/lib/useVideoChat';

interface MultiplayerGameProps {
  roomId: string; // The URL param
  userId: string; // Random or Auth ID
  onBack: () => void;
}

export function MultiplayerGame({ roomId, userId, onBack }: MultiplayerGameProps) {
  // Callback Ref to break dependency cycle between Signaling and VideoChat hooks
  const onGameUpdateRef = useRef<(payload: GamePayload) => void>(undefined);

  // 1. Core Signaling (Supabase)
  // useSupabaseRealtime now handles strict typing and expects GamePayload
  const { channel, presence } = useSupabaseRealtime(roomId, userId, (payload) => {
    onGameUpdateRef.current?.(payload);
  });

  // 2. We define the signaling channel adapter for WebRTC
  const signalingForVideo = useMemo(() => {
    if (!channel) return null;
    return {
      broadcastMove: async (move: MoveData) => {
        await channel.send({
          type: 'broadcast',
          event: 'game-update',
          payload: { move, from: userId },
        });
      }
    };
  }, [channel, userId]);

  // 3. Initialize Shared Game/Video Logic
  const { remoteCursor, videoChatProps } = useGameSync({
    roomId,
    userId,
    signalingChannel: signalingForVideo
  });

  // 4. Update the Callback Ref with latest video logic
  useEffect(() => {
    onGameUpdateRef.current = (payload: GamePayload) => {
      // Check if this is a WebRTC signal from a peer
      const isPeerSignal = 
        payload.from !== userId && 
        payload.move?.type === 'signal' && 
        payload.move?.payload;

      if (isPeerSignal) {
        // We cast because SignalPayload matches SignalData structure
        // but TypeScript might complain about exact type matching across files
        const section = payload.move as { type: 'signal', payload: SignalPayload };
        videoChatProps.handleSignal(section.payload as unknown as SignalData);
      }
    };
  }, [videoChatProps, userId]);

  return (
    <div className="relative w-full h-full bg-black">
      {/* 3D Game Board */}
      <div className="relative z-10 w-full h-full">
         <GameBoard /> 
      </div>

      {/* Networking Overlay Layer */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        
        {/* Remote "Ghost" Cursor */}
        <RemoteCursorOverlay 
          x={remoteCursor?.x ?? 0}
          y={remoteCursor?.y ?? 0}
          gesture={remoteCursor?.gesture ?? 'open'}
          isActive={!!remoteCursor}
        />

        {/* Video Chat (Bottom Right) */}
        <div className="pointer-events-auto">
          <VideoChat 
             localStream={videoChatProps.localStream}
             remoteStream={videoChatProps.remoteStream}
             connectionStatus={videoChatProps.connectionStatus}
             startCall={videoChatProps.startCall}
          />
        </div>

        {/* HUD / Botones */}
        <div className="absolute top-4 left-4 pointer-events-auto">
          <button 
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-white font-bold transition-all border border-white/5"
          >
            ← Salir de Sala
          </button>
          <div className="mt-2 px-2 py-1 bg-green-500/20 rounded border border-green-500/30 inline-block">
            <span className="text-green-400 text-xs font-mono">
              EN LÍNEA: {presence.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
