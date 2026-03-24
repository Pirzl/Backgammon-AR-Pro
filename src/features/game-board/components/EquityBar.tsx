import React from 'react';
import { motion } from 'framer-motion';

interface EquityBarProps {
  score: number; // -100 to 100 (Black's advantage from Gemini)
  myColor: 'white' | 'black' | null;
}

export const EquityBar: React.FC<EquityBarProps> = ({ score, myColor }) => {
  // If we don't know the player's color yet, default to 0
  if (!myColor) return null;

  // EXPLICACIÓN DE LA LÓGICA CORREGIDA:
  // Gemini devuelve el score desde la perspectiva de su propio cálculo.
  // Un valor positivo indica que las Blancas (Humano) están mejor posicionadas.
  // Un valor negativo indica que las Rojas/Negras (IA) están ganando.
  // Así que, independientemente del color, consideramos: positivo = Humano gana, negativo = Humano pierde.
  const playerAdvantage = score;
  
  const isPositive = playerAdvantage > 0;
  const isNeutral = playerAdvantage === 0;
  
  const getLabelAndColor = (adv: number) => {
    if (adv > 80) return { lines: ['VICTORIA', 'INMINENTE'], colorClass: 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' };
    if (adv > 30) return { lines: ['DOMINIO'], colorClass: 'text-emerald-500' };
    if (adv >= -30) return { lines: ['REÑIDO'], colorClass: 'text-slate-400' };
    if (adv > -80) return { lines: ['PELIGRO'], colorClass: 'text-orange-500' };
    return { lines: ['DERROTA', 'INMINENTE'], colorClass: 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]' };
  };

  const labelData = getLabelAndColor(playerAdvantage);
  
  // Normalize percentage for the half-bar (0 to 100% of the half-bar height)
  const heightPercent = Math.min(Math.abs(playerAdvantage), 100);

  return (
    <div className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-50 pointer-events-none">
      <div className={`flex flex-col items-center justify-center text-center leading-tight text-[10px] md:text-xs font-bold uppercase tracking-widest drop-shadow-md ${labelData.colorClass}`}>
        {labelData.lines.map((line, idx) => (
          <span key={idx} className="block">{line}</span>
        ))}
      </div>
      
      <div className="relative w-3 md:w-4 h-64 md:h-80 bg-slate-900/80 rounded-full border border-slate-700/50 overflow-hidden flex flex-col items-center justify-center shadow-2xl backdrop-blur-sm">
        {/* Center 0 Line */}
        <div className="absolute top-1/2 left-0 right-0 h-px w-full bg-white/50 z-10 shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
        
        {/* Positive Bar (Green, grows Up from center) */}
        <motion.div 
          className="absolute bottom-1/2 w-full bg-emerald-500 origin-bottom"
          style={{ boxShadow: '0 0 15px rgba(16,185,129,0.8), inset 0 0 8px rgba(255,255,255,0.5)' }}
          initial={{ height: 0 }}
          animate={{ height: isPositive ? `${heightPercent}%` : '0%' }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
        />
        
        {/* Negative Bar (Red/Orange, grows Down from center) */}
        <motion.div 
          className="absolute top-1/2 w-full bg-rose-600 origin-top"
          style={{ boxShadow: '0 0 15px rgba(225,29,72,0.8), inset 0 0 8px rgba(0,0,0,0.5)' }}
          initial={{ height: 0 }}
          animate={{ height: !isPositive && !isNeutral ? `${heightPercent}%` : '0%' }}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
        />
        
        {/* Glowing overlay indicator for the tip */}
        <motion.div
           className="absolute left-1/2 -translate-x-1/2 w-full h-1 bg-white rounded-full z-20 shadow-[0_0_10px_white]"
           initial={{ top: '50%' }}
           animate={{ 
             top: isPositive 
                 ? `calc(50% - ${heightPercent / 2}%)` 
                 : `calc(50% + ${heightPercent / 2}%)` 
           }}
           transition={{ type: "spring", stiffness: 50, damping: 15 }}
        />
      </div>
      
      <div className="flex flex-col items-center mt-1">
        <span className={`text-sm md:text-md font-black drop-shadow-[0_0_5px_currentColor] transition-colors duration-500
          ${isNeutral ? 'text-white/50' : (isPositive ? 'text-emerald-400' : 'text-rose-500')}`}
        >
          {isNeutral ? '0' : (isPositive ? `+${Math.round(playerAdvantage)}` : `${Math.round(playerAdvantage)}`)}
        </span>
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-[-2px]">
          EQ
        </span>
      </div>
    </div>
  );
};
