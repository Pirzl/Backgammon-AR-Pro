import { useMemo } from 'react';

interface DifficultySelectModalProps {
  isOpen: boolean;
  currentDifficulty: number;
  onSelect: (difficulty: number) => void;
  onClose: () => void;
}

interface Tier {
  id: string;
  label: string;
  range: string;
  emoji: string;
  value: number;
  description: string;
  accent: string;
}

const TIERS: Tier[] = [
  {
    id: 'principiante',
    label: 'Principiante',
    range: 'Nivel 1-2',
    emoji: '🍼',
    value: 1,
    description: 'Perfecto para aprender las reglas con calma.',
    accent: 'from-emerald-500/30 to-emerald-900/30 border-emerald-500/40 hover:border-emerald-400',
  },
  {
    id: 'medio',
    label: 'Medio',
    range: 'Nivel 3-5',
    emoji: '⚔️',
    value: 4,
    description: 'Un rival equilibrado que se toma el juego en serio.',
    accent: 'from-cyan-500/30 to-cyan-900/30 border-cyan-500/40 hover:border-cyan-400',
  },
  {
    id: 'fuerte',
    label: 'Fuerte',
    range: 'Nivel 6-7',
    emoji: '🛡️',
    value: 7,
    description: 'Jugador experimentado, cada ficha cuenta.',
    accent: 'from-amber-500/30 to-amber-900/30 border-amber-500/40 hover:border-amber-400',
  },
  {
    id: 'experto',
    label: 'Experto',
    range: 'Nivel 8-10',
    emoji: '👑',
    value: 10,
    description: 'El Gran Maestro. Solo para los más valientes.',
    accent: 'from-rose-500/30 to-rose-900/30 border-rose-500/40 hover:border-rose-400',
  },
];

export function DifficultySelectModal({
  isOpen,
  currentDifficulty,
  onSelect,
  onClose,
}: DifficultySelectModalProps) {
  const selectedTierId = useMemo(() => {
    const tier = TIERS.find((t) => t.value === currentDifficulty);
    return tier?.id ?? null;
  }, [currentDifficulty]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-cyan-700/40 rounded-2xl p-6 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
        <div className="text-center mb-5">
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-cyan-300">
            ¿A qué nivel quieres jugar?
          </h2>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-wider">
            Puedes cambiarlo en el menú en cualquier momento
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TIERS.map((tier) => {
            const isSelected = selectedTierId === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => onSelect(tier.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-b ${tier.accent} transition-all hover:scale-105 text-center ${
                  isSelected ? 'ring-2 ring-white/70' : ''
                }`}
              >
                <span className="text-4xl">{tier.emoji}</span>
                <span className="font-black uppercase tracking-wider text-white text-sm">
                  {tier.label}
                </span>
                <span className="text-[10px] font-bold text-white/60 uppercase">
                  {tier.range}
                </span>
                <span className="text-[10px] text-slate-300/80 leading-tight">
                  {tier.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center mt-5">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-zinc-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all text-xs"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
