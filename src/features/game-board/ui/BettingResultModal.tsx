/**
 * Betting Result Modal Component
 * Enhanced game over modal with complete betting information
 */

import { useState, useEffect } from 'react';
import { RotateCcw, Home } from 'lucide-react';
import { getGeminiUsageColor } from '../lib/geminiUsage';

interface BettingResultModalProps {
  isOpen: boolean;
  winner: 'white' | 'black';
  myColor: 'white' | 'black' | null;
  stakeInicial: number;
  cubeFinal: number;
  winMethod: 'normal' | 'gammon' | 'backgammon';
  totalGanado: number;
  geminiCallsToday?: number;
  geminiCallsGame?: number;
  geminiDailyLimit?: number;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function BettingResultModal({
  isOpen,
  winner,
  myColor,
  stakeInicial,
  cubeFinal,
  winMethod,
  totalGanado,
  geminiCallsToday,
  geminiCallsGame,
  geminiDailyLimit,
  onPlayAgain,
  onExit,
}: BettingResultModalProps) {
  const isWinner = myColor === winner;

  const [sassyMessage, setSassyMessage] = useState<string>('');

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (isOpen) {
      const winMessages = [
        "¡Wow, realmente lo hiciste! Felicidades.",
        "Una clase magistral de Backgammon.",
        "Los dados estuvieron contigo hoy.",
        "Victoria impecable. El Gran Maestro está impresionado."
      ];

      const loseMessages = [
        "¿Jugaste con el monitor apagado?",
        "Los dados te odiaban, pero tu estrategia tampoco ayudó.",
        "Auch. Eso dolió de solo verlo.",
        "¿Tal vez deberías intentar jugar a las damas?",
        "El Gran Maestro ni siquiera tuvo que esforzarse."
      ];

      const getRandomMessage = (messages: string[]) => {
        const idx = Math.floor(Math.random() * messages.length);
        return messages[idx] ?? '¡Buena partida!';
      };

      timeoutId = setTimeout(() => {
        setSassyMessage(isWinner 
          ? getRandomMessage(winMessages)
          : getRandomMessage(loseMessages)
        );
      }, 0);
    }

    return () => clearTimeout(timeoutId);
  }, [isOpen, isWinner]);

  if (!isOpen) return null;

  const winMethodText = {
    normal: 'Normal (x1)',
    gammon: 'Gammon (x2)',
    backgammon: 'Backgammon (x3)',
  }[winMethod];

  const multiplier = {
    normal: 1,
    gammon: 2,
    backgammon: 3,
  }[winMethod];

  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-500 p-4">
      <div className="flex flex-col items-center gap-4 p-6 bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-amber-700/50 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden max-w-lg w-full">
        {/* Background Glow */}
        <div className={`absolute inset-0 opacity-20 pointer-events-none ${
          isWinner 
            ? 'bg-gradient-to-b from-emerald-500/30 to-transparent' 
            : 'bg-gradient-to-b from-rose-500/30 to-transparent'
        }`} />
        
        <div className="relative z-10 flex flex-col items-center text-center w-full">
          {/* Winner Header */}
          <h2 className={`text-3xl md:text-4xl font-black uppercase tracking-widest ${
            isWinner 
              ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' 
              : 'text-rose-500'
          }`}>
            {winner === 'white' ? 'GANAN BLANCAS' : 'GANAN ROJAS'}
          </h2>
          
          <p className="text-slate-400 text-xs font-medium tracking-widest uppercase">
            PARTIDA FINALIZADA
          </p>

          <div className="px-4 py-3 bg-black/40 rounded-xl border border-white/10 italic text-sm text-slate-200 mt-2">
            "{sassyMessage}"
          </div>

          {/* Betting Information Card - Compact */}
          <div className="w-full bg-gradient-to-br from-amber-900/40 to-amber-950/40 rounded-xl border-2 border-amber-700/30 p-4 mt-2 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-amber-100 mb-3 uppercase tracking-wide">
              Información de Apuesta
            </h3>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="text-left">
                <div className="text-amber-300/70">Apuesta:</div>
                <div className="text-amber-100 font-bold">{stakeInicial} pts</div>
              </div>
              
              <div className="text-left">
                <div className="text-amber-300/70">Cubo:</div>
                <div className="text-amber-100 font-bold">x{cubeFinal}</div>
              </div>
              
              <div className="text-left">
                <div className="text-amber-300/70">Tipo:</div>
                <div className="text-amber-100 font-bold">{winMethodText}</div>
              </div>
              
              <div className="text-left">
                <div className="text-amber-300/70">Multiplicador:</div>
                <div className="text-amber-100 font-bold">x{multiplier}</div>
              </div>
            </div>
            
            {/* Total Won */}
            <div className="mt-3 pt-3 border-t border-amber-700/30">
              <div className="text-amber-300/70 text-xs">Total:</div>
              <div className={`text-2xl font-black ${
                isWinner ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {isWinner ? '+' : '-'}{totalGanado.toLocaleString()} pts
              </div>
            </div>
          </div>

          {typeof geminiCallsToday === 'number' && (
            <div className="w-full bg-black/40 rounded-xl border border-cyan-500/20 p-4 mt-2 backdrop-blur-sm">
              <h3 className="text-sm font-bold text-cyan-200 mb-2 uppercase tracking-wide">
                ✨ Gemini
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="text-left">
                  <div className="text-cyan-300/70">Esta partida:</div>
                  <div className="text-cyan-100 font-bold">{geminiCallsGame ?? 0} llamadas</div>
                </div>
                <div className="text-left">
                  <div className="text-cyan-300/70">Hoy (global):</div>
                  <div className={`font-bold ${getGeminiUsageColor(geminiCallsToday)}`}>
                    {geminiCallsToday} / {geminiDailyLimit ?? 1000}
                    <span className="opacity-70 font-normal">
                      {' '}· quedan {Math.max(0, (geminiDailyLimit ?? 1000) - geminiCallsToday)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-cyan-200/70 font-medium mt-2 border-t border-cyan-500/10 pt-2">
                Tokens FREE GRATIS · al agotarse hoy, la IA ya no puede pensar con claridad.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-3 w-full mt-2">
            <button 
              onClick={onPlayAgain}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg hover:shadow-cyan-500/50 flex items-center justify-center gap-2 text-sm"
            >
              <RotateCcw size={18} /> Nueva Partida
            </button>
            <button 
              onClick={onExit}
              className="px-4 py-3 bg-zinc-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Home size={18} /> Salir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
