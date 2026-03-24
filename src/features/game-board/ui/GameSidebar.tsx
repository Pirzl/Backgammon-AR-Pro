import { Power, Hand, Settings, User as ProfileIcon, Menu, X, PanelLeftClose } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UIGameState } from '../model/types';
import { useState, useRef, useEffect, useCallback } from 'react';
import { BettingInfo } from './BettingInfo';
import { HandTrackingSwitch } from '../../../shared/ui/HandTrackingSwitch/HandTrackingSwitch';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { usePlayerStats } from '../lib/usePlayerStats';

interface GameSidebarProps {
  state: UIGameState;
  isHandTracking: boolean;
  onToggleHandTracking: () => void;
  onNewGame: () => void;
  onExit: () => void;
  onSetOpacity: (val: number) => void;
  boardOpacity: number;
  variant?: 'sidebar' | 'drawer';
  isOpen?: boolean;
  onToggle?: () => void;
  // H2H Betting props (only shown in human mode)
  isBettingMode?: boolean;
  stakeInicial?: number;
  myColor?: 'white' | 'black' | null;
  onAcceptDouble?: () => void;
  onDenyDouble?: () => void;
}

export function GameSidebar({
  state,
  isHandTracking,
  onToggleHandTracking,
  onNewGame,
  onExit,
  onSetOpacity,
  boardOpacity,
  variant = 'drawer',
  isOpen: controlledIsOpen,
  onToggle,
  isBettingMode = false,
  stakeInicial = 0,
  myColor = null,
  onAcceptDouble,
  onDenyDouble,
}: GameSidebarProps) {
  // Force HMR refresh
  const { turn, matchScore } = state;
  const { user } = useAuth();
  const { wins, losses, loading: statsLoading } = usePlayerStats();
  const navigate = useNavigate();
  
  // Internal state fallback if not controlled
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;

  // Track previous state for "adjust state during render" pattern
  const [prevIsOpen, setPrevIsOpen] = useState<boolean | null>(null);
  const [use3DStyle] = useState(true);

  // Adjust state during render to avoid cascading updates in useEffect
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      // Logic for keeping style active or potentially checking localStorage 
      // is already handled by the permanent 'true' initial state for this phase.
    }
  }

  const handleToggle = useCallback(() => {
     if (onToggle) {
        onToggle();
     } else {
        setInternalIsOpen(prev => !prev);
     }
  }, [onToggle, setInternalIsOpen]);

  // A11y: Escape Key & Focus Trap
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || variant !== 'drawer') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleToggle();
      }
    };

    // Simple Focus Trap
    const focusableElements = drawerRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements?.[0] as HTMLElement;
    const lastElement = focusableElements?.[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) { /* shift + tab */
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else { /* tab */
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Capture ref for cleanup
    const currentDrawer = drawerRef.current;
    
    if (currentDrawer) {
        currentDrawer.addEventListener('keydown', handleTab);
        // Focus first element after animation (small delay)
        setTimeout(() => firstElement?.focus(), 100);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (currentDrawer) {
        currentDrawer.removeEventListener('keydown', handleTab); 
      }
    };
  }, [isOpen, variant, handleToggle]);

  return (
    <>
      {/* Mobile Hamburger Button - Only show if in drawer mode */}
      {variant === 'drawer' && (
        <button 
          onClick={handleToggle}
          className="fixed top-4 left-4 z-[120] p-3 bg-black/50 backdrop-blur-md rounded-xl border border-white/10 text-white lg:hidden hover:bg-white/10 transition-colors"
          style={{ left: 'max(1rem, env(safe-area-inset-left))', top: 'max(1rem, env(safe-area-inset-top))' }}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      )}

      {/* Sidebar Container */}
      <AnimatePresence mode="wait">
        {/* Usamos CSS para controlar visibilidad */}
        <motion.div 
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú del Juego"
            initial={false}
            animate={variant === 'drawer' ? { x: isOpen ? 0 : -320 } : { x: 0 }}
            className={`
              ${variant === 'drawer' ? 'fixed left-0 top-0 h-[100dvh] z-[110] shadow-2xl' : 'relative h-full z-40 border-r border-white/10 [transform:translateZ(0)]'}
              w-80 
              bg-black/40 hover:bg-black/60 backdrop-blur-md hover:backdrop-blur-xl
              flex flex-col p-6 overflow-y-auto overflow-x-hidden
              transition-all duration-500 ease-in-out
            `}
          >

              {/* Desktop Collapse Button */}
            {variant === 'sidebar' && (
               <button 
                 onClick={handleToggle}
                 className="absolute top-4 right-4 p-2 text-[#cc0000] hover:text-white hover:bg-[#cc0000] rounded-lg transition-all shadow-[0_0_10px_rgba(204,0,0,0.2)] flex items-center justify-center z-[120]"
                 title="Cerrar Menú"
               >
                  <PanelLeftClose size={20} />
               </button>
            )}

            {/* Turn Indicator */}
            <div 
              className="w-full py-4 rounded-xl mb-8 flex items-center justify-center gap-3 font-black text-xl uppercase tracking-widest shadow-lg transition-colors duration-500 mt-12 md:mt-0"
              style={{ 
                background: turn === 'white' ? 'var(--white-player)' : '#660000', // Deep Red for turn
                color: turn === 'white' ? '#5a3a00' : '#ffcccc',
                boxShadow: `0 0 30px ${turn === 'white' ? 'var(--white-glow)' : 'rgba(255, 0, 0, 0.4)'}`
              }}
            >
              <span>{turn === 'white' ? 'BLANCAS' : 'ROJAS'}</span>
            </div>

            {/* Score Board */}
            <div className="flex justify-between mb-8 px-2">
              <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-white">{matchScore.white}</div>
                <div className="text-[10px] font-bold uppercase text-white/40 tracking-[0.2em]">BLANCAS</div>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-red-500">{matchScore.black}</div>
                <div className="text-[10px] font-bold uppercase text-red-500/60 tracking-[0.2em]">ROJAS</div>
              </div>
            </div>

            {/* H2H Betting Panel — only in human mode, lives here instead of floating over board */}
            {isBettingMode && (
              <div className="mb-6">
                <div className="text-[10px] font-bold uppercase text-amber-300/60 tracking-wider mb-2">APUESTA ACTIVA</div>
                <BettingInfo
                  stakeInicial={stakeInicial}
                  cubeValue={state.cube}
                  apuestaTotal={stakeInicial * state.cube}
                  isDoubleOffered={state.cubeOwner === null && state.cube > 1}
                  offeredBy={state.cubeOwner === null && state.cube > 1 ? (state.turn === 'white' ? 'black' : 'white') : null}
                  myColor={myColor}
                  onAccept={onAcceptDouble}
                  onDeny={onDenyDouble}
                />
              </div>
            )}

            {/* Dice History - Last 3 Rolls */}
            {state.rollHistory && state.rollHistory.length > 0 && (
               <div className="mb-8">
                  <div className="text-[10px] font-bold uppercase text-white/30 tracking-wider mb-3 text-center">HISTORIAL DE DADOS</div>
                  <div className="flex flex-col gap-2">
                     {[...state.rollHistory].reverse().slice(0, 3).map((roll, i) => (
                        <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${roll.player === 'white' ? 'bg-white/5 border-white/10' : 'bg-red-900/10 border-red-500/10'}`}>
                            <span className={`text-[10px] font-bold uppercase ${roll.player === 'white' ? 'text-white/60' : 'text-red-400/60'}`}>
                                {roll.player === 'white' ? 'BLANCAS' : 'ROJAS'}
                            </span>
                            <div className="flex gap-1">
                                {roll.dice.map((d, idx) => (
                                    <div key={idx} className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${roll.player === 'white' ? 'bg-white text-black' : 'bg-red-600 text-white'}`}>
                                        {d}
                                    </div>
                                ))}
                            </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {/* Camera Control Section */}
            <div className="flex flex-col gap-4 mb-8">
               {use3DStyle ? (
                 <div className="flex flex-col items-center gap-1 p-4 bg-black/20 border border-white/10 rounded-2xl relative overflow-hidden group hover:bg-black/40 transition-all duration-500">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    
                    <div className="flex flex-col items-center mb-2">
                      <span className="text-[10px] font-black uppercase text-white/80 tracking-widest leading-none">CÁMARA CONTROL</span>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mt-1">Movimiento con mano</span>
                    </div>

                    <HandTrackingSwitch 
                      checked={isHandTracking} 
                      onChange={onToggleHandTracking} 
                      scale={0.4} 
                    />

                    <div className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isHandTracking ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">{isHandTracking ? 'ACTIVO' : 'INACTIVO'}</span>
                    </div>
                 </div>
               ) : (
                 <button
                  onClick={onToggleHandTracking}
                  className={`
                    flex flex-col items-center justify-center p-3 rounded-xl border transition-all
                    ${isHandTracking 
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}
                  `}
                >
                  <Hand size={20} className="mb-1" />
                  <span className="text-[10px] font-bold uppercase">CÁMARA {isHandTracking ? 'ON' : 'OFF'}</span>
                </button>
               )}

            </div>


            {/* Main Actions */}
            <div className="flex flex-col gap-4 mb-auto">
              <button
                onClick={onNewGame}
                className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl text-cyan-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              >
                <Settings size={16} />
                NUEVA PARTIDA
              </button>

              {/* Authentication */}
              {!user ? (
                 <div className="flex gap-2">
                    <button
                      onClick={() => navigate('/auth/login')}
                      className="flex-1 py-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-xl text-purple-400 text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      LOGIN
                    </button>
                    <button
                      onClick={() => navigate('/auth/register')}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/20 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      REGISTRO
                    </button>
                 </div>
              ) : (
                <div className="flex flex-col gap-2">
                    {/* User Stats Display */}
                    <div className="grid grid-cols-2 gap-2 mb-1">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg flex flex-col items-center">
                            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">VICTORIAS</span>
                            <span className="text-lg font-black text-emerald-400">{statsLoading ? '-' : wins}</span>
                        </div>
                        <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg flex flex-col items-center">
                            <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">DERROTAS</span>
                            <span className="text-lg font-black text-rose-400">{statsLoading ? '-' : losses}</span>
                        </div>
                    </div>

                    <button
                      onClick={() => navigate('/dashboard')}
                      className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl text-cyan-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                    >
                      <ProfileIcon size={16} />
                       PERFIL ({user.user_metadata?.username || user.user_metadata?.first_name || user.email?.split('@')[0]})
                    </button>
                </div>
              )}
            </div>

            {/* Settings / Footer */}
            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                 <div className="flex justify-between text-[10px] font-bold uppercase text-white/40 tracking-wider">
                    <span>OPACIDAD TABLERO</span>
                    <span>{Math.round(boardOpacity * 100)}%</span>
                 </div>
                 <input 
                   type="range" 
                   min="0" 
                   max="1" 
                   step="0.05"
                   value={boardOpacity}
                   onChange={(e) => onSetOpacity(parseFloat(e.target.value))}
                   className="w-full accent-cyan-400 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                 />
              </div>

              <button
                onClick={onExit}
                className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              >
                <Power size={16} />
                SALIR
              </button>
            </div>
          </motion.div>

      </AnimatePresence>
    </>
  );
}
