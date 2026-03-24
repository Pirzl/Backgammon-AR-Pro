import { motion } from 'framer-motion';

interface HandCursorProps {
  x: number;
  y: number;
  gesture: 'open' | 'pinch';
}

/**
 * HandCursor Component
 * Visual feedback for hand interaction.
 * Moves smoothly with the hand and changes state on pinch.
 */
export function HandCursor({ x, y, gesture }: HandCursorProps) {
  const isPinching = gesture === 'pinch';

  return (
    <motion.div
      className="fixed z-50 pointer-events-none flex items-center justify-center"
      style={{ 
        left: x, 
        top: y,
        transform: 'translate(-50%, -50%)' // Center the cursor
      }}
      animate={{
        scale: isPinching ? 0.8 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 30
      }}
    >
      {/* Outer Ring */}
      <div 
        className={`
          w-12 h-12 rounded-full border-4 
          ${isPinching ? 'border-red-500 bg-red-500/20' : 'border-green-400 bg-green-400/10'}
          transition-colors duration-150 shadow-[0_0_20px_rgba(0,0,0,0.5)]
        `}
      />
      
      {/* Inner Dot */}
      <div 
        className={`
          absolute w-3 h-3 rounded-full 
          ${isPinching ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]'}
          transition-all duration-150
        `}
      />
      
      {/* Label (Optional debug) */}
      <span className="absolute top-12 text-[10px] font-black uppercase text-white/50 tracking-widest">
        {isPinching ? 'GRAB' : 'v2 (Tip)'}
      </span>
    </motion.div>
  );
}
