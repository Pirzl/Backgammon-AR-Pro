import { useState, useEffect } from 'react';
import { X, BookOpen, MousePointerClick, Flag, LogOut, Trophy } from 'lucide-react';

const TUTORIAL_KEY = 'vivo_tutorial_seen';

// In-memory fallback so the tutorial never re-shows within a session even if
// localStorage is blocked (private mode / cookie banner not accepted).
let seenInSession = false;

export function hasSeenTutorial(): boolean {
  if (seenInSession) return true;
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  seenInSession = true;
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore (private mode / blocked storage) */
  }
}

const STEPS = [
  {
    icon: <MousePointerClick size={22} className="text-cyan-300" />,
    title: 'Cómo mover',
    text: 'Pulsa una ficha de tu color para seleccionarla (se ilumina). Luego pulsa un triángulo resaltado en cian: es un destino válido. También puedes navegar con el teclado (Tab + Enter).',
  },
  {
    icon: <Flag size={22} className="text-amber-300" />,
    title: 'La Barra',
    text: 'Si una ficha tuya fue capturada, va a la Barra central. Debes reintroducirla en la zona de tu rival antes de cualquier otro movimiento. La Barra se resalta cuando es obligatoria.',
  },
  {
    icon: <LogOut size={22} className="text-emerald-300" />,
    title: 'Sacar fichas (Bear-off)',
    text: 'Cuando todas tus fichas están en tu última cuarta parte del tablero, púlsalas para sacarlas por la bandeja "FUERA". ¡Saca todas para ganar!',
  },
  {
    icon: <Trophy size={22} className="text-rose-300" />,
    title: 'Ganar la partida',
    text: 'El turno pasa solo tras completar tus dados. El indicador superior (Blancas/Rojas · Tu turno · 🎲) y el sonido te guían en cada jugada.',
  },
];

interface FirstRunTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FirstRunTutorial({ isOpen, onClose }: FirstRunTutorialProps) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(true);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  if (!current) return null;

  const finish = () => {
    if (dontShow) markTutorialSeen();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial de primer uso"
    >
      <div className="bg-gradient-to-br from-slate-900/95 to-slate-950/95 border-2 border-cyan-700/40 rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="flex items-center gap-2 text-xl md:text-2xl font-black text-cyan-100 uppercase tracking-wider">
            <BookOpen size={22} /> Tutorial
          </h2>
          <button
            onClick={finish}
            className="text-slate-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800/50"
            aria-label="Cerrar tutorial"
          >
            <X size={24} />
          </button>
        </div>

        {/* Step content */}
        <div className="flex items-start gap-3 mb-5">
          <div className="shrink-0 mt-1">{current.icon}</div>
          <div>
            <h3 className="text-lg font-black text-white mb-1">{current.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{current.text}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-5 justify-center">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-cyan-400' : 'w-1.5 bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-3 rounded-lg font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Atrás
          </button>

          {isLast ? (
            <button
              onClick={finish}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              ¡Empezar a jugar!
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Siguiente
            </button>
          )}
        </div>

        {/* Don't show again */}
        <label className="flex items-center gap-2 mt-4 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-cyan-500"
          />
          No volver a mostrar este tutorial
        </label>
      </div>
    </div>
  );
}
