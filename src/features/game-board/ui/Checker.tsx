import { motion } from 'framer-motion';
import type { PlayerColor } from '../../../entities/game/types';

interface CheckerProps {
  color: PlayerColor;
  isSelected?: boolean;
  onTap?: () => void;
  style?: React.CSSProperties;
  variant?: 'flat' | 'edge'; // 'flat' for board, 'edge' for tray
}

/**
 * Checker component - Premium 3D Resin/Stone visualization
 * Supports "Tap-to-Select" interaction model
 */
export function Checker({ 
  color, 
  isSelected, 
  onTap, 
  style, 
  variant = 'flat' 
}: CheckerProps) {
  const isWhite = color === 'white';
  const isEdge = variant === 'edge';

  // --- PREMIUM MATERIAL DEFINITIONS ---
  
  // 1. Base Materials (Resin/Stone look)
  const whiteBase = 'radial-gradient(circle at 30% 30%, #ffffff, #e0e0e0, #b0b0b0)';
  const blackBase = 'radial-gradient(circle at 30% 30%, #990000, #550000, #220000)'; // RUBY RED BASE
  
  // 2. Edge/Cylinder Materials - Refined for Side View

  // 3. Shadows & Highlights
  const baseShadow = '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.3)';
  const selectedShadow = isWhite
    ? '0 0 0 3px #00d2ff, 0 0 15px #00d2ff' // Cyan Neon Glow for White
    : '0 0 0 3px #ffaa00, 0 0 15px #ffaa00'; // Gold Neon Glow for Red/Black

  const shadow = isSelected ? selectedShadow : baseShadow;

  // --- LAYOUT variant config ---
  const layoutClass = isEdge 
    ? 'w-full h-full rounded-sm' // Edge view
    : 'w-[3.8cqw] h-[3.8cqw] max-w-[48px] max-h-[48px] rounded-full'; // Flat view

  return (
    <motion.div
      layout
      onClick={(e) => {
        e.stopPropagation();
        onTap?.();
      }}
      initial={false}
      animate={{ 
         scale: isSelected ? 1.1 : 1,
         zIndex: isSelected ? 50 : 1
      }}
      className={`
        relative ${layoutClass}
        ${!isEdge ? 'cursor-pointer active:scale-95' : 'cursor-default'}
        flex items-center justify-center
        transition-shadow duration-200
      `}
      style={{
        background: isEdge 
            ? (isWhite 
                ? 'linear-gradient(to bottom, #f0f0f0 0%, #d0d0d0 20%, #ffffff 40%, #c0c0c0 100%)' // White Edge
                : 'linear-gradient(to bottom, #600000 0%, #300000 20%, #800000 40%, #200000 100%)'  // Red Edge
              )
            : (isWhite ? whiteBase : blackBase),
        boxShadow: isEdge 
            ? '0 1px 2px rgba(0,0,0,0.5)' // Simple shadow for stack
            : shadow,
        border: isEdge 
            ? (isWhite ? '1px solid #999' : '1px solid #000') 
            : (isWhite ? '1px solid #999' : '1px solid #300'),
        ...style
      }}
      whileHover={!isEdge ? { 
        filter: 'brightness(1.1)',
      } : undefined}
      whileTap={!isEdge ? { scale: 0.95 } : undefined}
    >
      {/* --- FLAT VIEW DETAILS --- */}
      {!isEdge && (
        <>
          {/* Inner Groove (Machined look) */}
          <div className="absolute inset-[15%] rounded-full border border-black/5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_1px_1px_rgba(255,255,255,0.3)] opacity-70 pointer-events-none" />
          
          {/* Center Indent */}
          <div className="absolute inset-[40%] rounded-full bg-black/5 shadow-inner pointer-events-none" />

          {/* Specular Highlight (Glossy Coat) */}
          <div className="absolute top-[5%] left-[10%] w-[40%] h-[25%] bg-gradient-to-br from-white to-transparent rounded-full opacity-40 blur-[2px] pointer-events-none" />
        </>
      )}

      {/* --- EDGE VIEW DETAILS (Premium Side Profile) --- */}
      {isEdge && (
         <>
            {/* Main Body Gradient (Cylinder Side) */}
            <div className="absolute inset-x-0 top-[10%] bottom-[10%] bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
            
            {/* Central Groove (The "Gap" between two checkers or the groove logic) 
                 actually for a single thick checker side view, we usually see layers. 
                 Let's make it look like a stack of 2 or just a detailed single.
                 A backgammon checker usually has a rounded edge. 
            */}
            
            {/* Top Highlight (Rim) */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/40 opacity-80" />
            
            {/* Middle Groove (Dark Band) */}
            <div className="absolute top-[45%] bottom-[45%] left-0 right-0 bg-black/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
            
            {/* Bot Highlight (Rim) */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-black/40" />
         </>
      )}
    </motion.div>
  );
}
