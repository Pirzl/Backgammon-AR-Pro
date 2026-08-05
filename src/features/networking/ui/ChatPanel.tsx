import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { MAX_CHAT_MESSAGE_LENGTH, type ChatMessage } from '../lib/useChat';

interface ChatPanelProps {
  messages: ChatMessage[];
  isOpen: boolean;
  onToggle: () => void;
  onSend: (text: string) => boolean;
  connectionStatus: RTCPeerConnectionState;
}

export function ChatPanel({ messages, isOpen, onToggle, onSend, connectionStatus }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const connected = connectionStatus === 'connected';

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text || !connected) return;
    const ok = onSend(text);
    if (ok) setDraft('');
  }, [draft, connected, onSend]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        title="Chat"
        className="fixed bottom-56 right-2 z-50 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white hover:text-cyan-400 transition-colors flex items-center justify-center"
      >
        <MessageCircle size={18} />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-52 right-2 z-50 w-72 max-w-[calc(100vw-1rem)] h-72 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 flex flex-col overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10">
        <span className="text-xs uppercase font-bold tracking-widest text-white/70">Chat</span>
        <button onClick={onToggle} title="Cerrar" className="text-white/60 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {messages.length === 0 && (
          <p className="text-[10px] text-white/40 text-center pt-6">
            {connected ? 'Escribe un mensaje...' : 'Esperando conexión...'}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs break-words whitespace-pre-wrap ${
                m.fromMe
                  ? 'bg-cyan-500 text-black rounded-br-sm'
                  : 'bg-white/10 text-white rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        className="flex items-center gap-2 px-2 py-2 border-t border-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHAT_MESSAGE_LENGTH))}
          placeholder={connected ? 'Escribe...' : 'Sin conexión'}
          disabled={!connected}
          className="flex-1 min-w-0 bg-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:bg-white/15"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          title="Enviar"
          className="shrink-0 w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black flex items-center justify-center transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
