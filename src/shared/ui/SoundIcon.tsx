import { Volume2, VolumeX } from 'lucide-react';

interface SoundToggleButtonProps {
  /** Whether sound is currently enabled. */
  on: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Sound on/off toggle used in the game sidebar.
 *
 * Purely presentational — the caller owns the state and persistence
 * (see `features/game-board/lib/sound.ts`).
 */
export function SoundToggleButton({ on, onToggle, className = '' }: SoundToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? 'Desactivar sonido' : 'Activar sonido'}
      title={on ? 'Sonido activado' : 'Sonido desactivado'}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer ${
        on
          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
          : 'border-white/10 bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
      } ${className}`}
    >
      {on ? <Volume2 size={20} /> : <VolumeX size={20} />}
    </button>
  );
}
