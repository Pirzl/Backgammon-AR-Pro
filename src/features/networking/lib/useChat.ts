import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  text: string;
  at: number;
}

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

interface UseChatOptions {
  sendData: (data: unknown) => boolean;
  enabled: boolean;
}

/**
 * In-memory H2H text chat over the WebRTC data channel.
 * Sends via `sendData` ({ type: 'chat-message', payload }), receives via the
 * existing `vivo-data-message` window event that useVideoChat dispatches.
 * History is kept only for the current game session (per requirement).
 */
export function useChat({ sendData, enabled }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const idCounter = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleMessage = (e: Event) => {
      const data = (e as CustomEvent).detail as { type?: string; payload?: unknown } | null;
      if (!data || data.type !== 'chat-message' || typeof data.payload !== 'string') return;

      const text = data.payload.trim();
      if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) return;

      const msg: ChatMessage = {
        id: `r${idCounter.current++}`,
        fromMe: false,
        text,
        at: Date.now(),
      };
      setMessages((prev) => [...prev.slice(-199), msg]);
    };

    window.addEventListener('vivo-data-message', handleMessage);
    return () => window.removeEventListener('vivo-data-message', handleMessage);
  }, [enabled]);

  const sendChat = useCallback(
    (raw: string): boolean => {
      const text = raw.trim();
      if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) return false;

      const ok = sendData({ type: 'chat-message', payload: text });
      if (ok) {
        const msg: ChatMessage = {
          id: `s${idCounter.current++}`,
          fromMe: true,
          text,
          at: Date.now(),
        };
        setMessages((prev) => [...prev.slice(-199), msg]);
      }
      return ok;
    },
    [sendData]
  );

  const toggleChat = useCallback(() => setIsOpen((o) => !o), []);

  return { messages, sendChat, isOpen, toggleChat };
}
