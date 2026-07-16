import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Static list of in-game keyboard shortcuts. Keep keys in sync with the
// global key handler in GameBoard (the useEffect that listens for keydown).
const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: 'R', desc: 'Lanzar dados (Roll)' },
  { keys: 'N', desc: 'Nueva partida (New game)' },
  { keys: 'T', desc: 'Abrir tutorial' },
  { keys: 'C', desc: 'Alternar cámara (hand-tracking)' },
  { keys: 'S', desc: 'Alternar sonido (Sound)' },
  { keys: '?', desc: 'Mostrar / ocultar este atajo (Atajos)' },
  { keys: 'Esc', desc: 'Cerrar este panel / cancelar selección' },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
        >
          <X size={18} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Keyboard size={20} className="text-cyan-300" />
          <h2 className="text-lg font-black uppercase tracking-wider text-white">
            Atajos de teclado
          </h2>
        </div>

        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2"
            >
              <span className="text-sm text-slate-300">{s.desc}</span>
              <kbd className="shrink-0 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-300">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Pulsa <kbd className="rounded border border-white/20 px-1">?</kbd> en cualquier momento para abrir este panel.
        </p>
      </div>
    </div>
  );
}
