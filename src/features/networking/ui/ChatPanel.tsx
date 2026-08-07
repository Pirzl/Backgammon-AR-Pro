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

// Clave de posición por dispositivo (móvil/tablet/escritorio) para que cada
// uno recuerde dónde dejó el panel.
const POS_STORAGE_KEY = 'backgammon-vivo-chat-position';

interface SavedPos {
  x: number;
  y: number;
}

function loadPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedPos;
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch { /* ignore */ }
  return null;
}

function savePos(p: SavedPos) {
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function ChatPanel({ messages, isOpen, onToggle, onSend, connectionStatus }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Posición en px (esquina sup-izq del panel). null = usar posición por defecto.
  const [pos, setPos] = useState<SavedPos | null>(() => loadPos());
  const dragState = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Aplica la posición al montar y cuando cambie.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !pos) return;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, [pos]);

  const connected = connectionStatus === 'connected';

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text || !connected) return;
    const ok = onSend(text);
    if (ok) setDraft('');
  }, [draft, connected, onSend]);

  // --- Drag por la cabecera (pointer events: funciona en móvil y PC) ---
  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const cur = pos ?? { x: rect.left, y: rect.top };
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: cur.x,
      baseY: cur.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pos]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = panelRef.current?.offsetWidth ?? 288;
    const h = panelRef.current?.offsetHeight ?? 288;
    const nx = clamp(d.baseX + dx, 0, Math.max(0, vw - w));
    const ny = clamp(d.baseY + dy, 0, Math.max(0, vh - h));
    setPos({ x: nx, y: ny });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d.active) return;
    d.active = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setPos((p) => {
      const next = p ?? { x: 0, y: 0 };
      savePos(next);
      return next;
    });
  }, []);

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
    <div
      ref={panelRef}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      className="fixed bottom-52 right-2 z-50 w-72 max-w-[calc(100vw-1rem)] h-72 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 flex flex-col overflow-hidden shadow-2xl"
    >
      {/* Header (arrástralo para mover el panel) */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10 cursor-grab active:cursor-grabbing touch-none select-none"
      >
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
