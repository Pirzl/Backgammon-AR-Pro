import { X, Dices, Hand, Target, TrendingUp } from 'lucide-react';

const STORAGE_KEY = 'vivo_seen_tutorial';

/** True once the user has dismissed the first-run tutorial on this device. */
export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // localStorage unavailable (private mode / blocked) — treat as seen so the
    // tutorial can never become an unclosable blocker.
    return true;
  }
}

/** Remember that the tutorial has been dismissed. */
export function markTutorialSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* ignore */
  }
}

interface FirstRunTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS: { icon: typeof Dices; title: string; desc: string }[] = [
  {
    icon: Dices,
    title: 'Lanza los dados',
    desc: 'Pulsa el botón del dado (o la tecla R) para comenzar tu turno.',
  },
  {
    icon: Target,
    title: 'Mueve tus fichas',
    desc: 'Toca una ficha para seleccionarla y luego el punto de destino resaltado.',
  },
  {
    icon: Hand,
    title: 'Control por gestos',
    desc: 'Activa la cámara para mover fichas pellizcando con la mano en el aire.',
  },
  {
    icon: TrendingUp,
    title: 'Dobla la apuesta',
    desc: 'Pulsa el cubo para ofrecer un doble y multiplicar los puntos en juego.',
  },
];

/**
 * First-run instructions, shown once per device.
 *
 * Dismissing persists the flag so it never reappears, but the modal can still
 * be reopened on demand from the sidebar.
 */
export function FirstRunTutorial({ isOpen, onClose }: FirstRunTutorialProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    markTutorialSeen();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cómo jugar"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>

        <h2 className="mb-1 text-lg font-black uppercase tracking-wider text-white">
          Cómo jugar
        </h2>
        <p className="mb-5 text-sm text-slate-400">
          Lo esencial para tu primera partida de backgammon.
        </p>

        <ul className="mb-6 flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, desc }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/5 p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                <Icon size={18} />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-white">{title}</span>
                <span className="text-xs leading-relaxed text-slate-400">{desc}</span>
              </div>
            </li>
          ))}
        </ul>

        <button
          onClick={handleClose}
          className="w-full cursor-pointer rounded-xl bg-amber-500 py-3 text-sm font-bold uppercase tracking-widest text-black shadow-[0_0_16px_rgba(245,158,11,0.4)] transition-all hover:bg-amber-400"
        >
          Empezar a jugar
        </button>
      </div>
    </div>
  );
}
