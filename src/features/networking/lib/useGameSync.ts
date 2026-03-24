import { useEffect, useState, useCallback, useRef } from 'react';
import { useVideoChat } from './useVideoChat';

interface CursorPayload {
  type: 'cursor';
  x: number;
  y: number;
  gesture: 'open' | 'pinch';
}

export interface GameSyncReturn {
  remoteCursor: CursorPayload | null;
  sendCursorRaw: (x: number, y: number, gesture: 'open' | 'pinch') => void;
  videoChatProps: ReturnType<typeof useVideoChat>; // Passthrough
}

export function useGameSync(videoChatProps: Parameters<typeof useVideoChat>[0]) {
  const chat = useVideoChat(videoChatProps);
  const { sendData } = chat;
  const [remoteCursor, setRemoteCursor] = useState<CursorPayload | null>(null);

  // Listen for Data Channel events via DOM Event (Loose Coupling)
  useEffect(() => {
    const handleDataMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail as CursorPayload;
      if (data && data.type === 'cursor') {
        setRemoteCursor(data);
      }
    };

    window.addEventListener('vivo-data-message', handleDataMessage);
    return () => {
      window.removeEventListener('vivo-data-message', handleDataMessage);
    };
  }, []);

  // Throttled Sender (30 FPS to reduce network traffic)
  const lastSendTimeRef = useRef(0);
  const THROTTLE_MS = 33; // ~30 FPS
  
  const sendCursorRaw = useCallback((x: number, y: number, gesture: 'open' | 'pinch') => {
    const now = performance.now();
    if (now - lastSendTimeRef.current < THROTTLE_MS) {
      return; // Skip this frame
    }
    lastSendTimeRef.current = now;
    
    sendData({
      type: 'cursor',
      x,
      y,
      gesture
    });
  }, [sendData]);

  return {
    remoteCursor,
    sendCursorRaw,
    videoChatProps: chat
  };
}
