import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePongPhysics } from '../lib/usePongPhysics';
import { GAME_WIDTH, GAME_HEIGHT } from '../lib/pongUtils';
import { ArrowLeft, Play, Pause, RotateCcw, Gamepad2, Camera, CameraOff, Volume2, VolumeX, Monitor, MonitorOff } from 'lucide-react';
import { HandTrackingLayer } from '../../../hand-tracking/ui/HandTrackingLayer';
import { useHandInteraction } from '../../../hand-tracking/lib/useHandInteraction';
import type { BoardDimensions } from '../../../game-board/lib/useBoardDimensions';
import { pongAudio } from '../lib/pongAudio';
import IzquierdaIcon from '../assets/izquierda.svg';
import DerechaIcon from '../assets/derecha.svg';

export const PongGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Settings states
  const [playerSide, setPlayerSide] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('vivo_pong_player_side') as 'left' | 'right') || 'left';
  });
  const [isHandTrackingOn, setIsHandTrackingOn] = useState(() => {
    return localStorage.getItem('vivo_hand_tracking_enabled') === 'true';
  });
  const [isAudioOn, setIsAudioOn] = useState(() => {
    return localStorage.getItem('vivo_pong_audio_enabled') !== 'false'; // Default to true
  });
  const [isCRTOn, setIsCRTOn] = useState(() => {
    return localStorage.getItem('vivo_pong_crt_enabled') !== 'false'; // Default to true
  });

  // Sync audio engine with state
  useEffect(() => {
    pongAudio.setEnabled(isAudioOn);
  }, [isAudioOn]);

  // Sync side with localStorage
  useEffect(() => {
    localStorage.setItem('vivo_pong_player_side', playerSide);
  }, [playerSide]);

  // Container dimensions for hand tracking coordinate mapping
  const [containerDims, setContainerDims] = useState<BoardDimensions>({
    width: 0, height: 0, top: 0, left: 0, aspectRatio: 1
  });

  // Measure the game container 
  useEffect(() => {
    const el = gameContainerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerDims({
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        aspectRatio: rect.width / rect.height
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Hand interaction hook (reused from Backgammon)
  const { cursor, gesture, isHandActive } = useHandInteraction(
    containerDims,
    true // always active
  );

  const { 
    startGame, resumeGame, hasSavedGame, score, winner, isPlaying, isPaused, togglePause, 
    level, handleTouchY, shakeOffset
  } = usePongPhysics(canvasRef, playerSide);

  // Feed hand tracking Y position into the paddle controller
  useEffect(() => {
    if (isHandTrackingOn && isHandActive && cursor && isPlaying && !winner) {
      handleTouchY(cursor.y);
    }
  }, [isHandTrackingOn, isHandActive, cursor, isPlaying, winner, handleTouchY]);

  // Viewport Lock Lifecycle
  useEffect(() => {
    // Add safe area support to body, but don't lock scroll so tightly that footer disappears
    const originalStyle = document.body.style.cssText;
    document.body.style.touchAction = 'pan-y'; // Allow vertical pan for footer access

    return () => {
      // Restore original styles on unmount
      document.body.style.cssText = originalStyle;
    };
  }, []);

  // Canvas responsive resize — now uses the flex game area directly
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      // Use the game area wrapper instead of the full page container
      const gameArea = document.getElementById('pong-game-area');
      if (canvas && gameArea) {
        const availableWidth = gameArea.clientWidth * 0.96; 
        const availableHeight = gameArea.clientHeight * 0.96;
        
        const aspect = GAME_WIDTH / GAME_HEIGHT;
        let newWidth = availableWidth;
        let newHeight = newWidth / aspect;

        if (newHeight > availableHeight) {
          newHeight = availableHeight;
          newWidth = newHeight * aspect;
        }

        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    // Extra trigger for mobile orientation changes
    const timer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Pointer (mouse/touch) handler
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isPlaying && !winner) {
      handleTouchY(e.clientY);
    }
  }, [isPlaying, winner, handleTouchY]);

  const toggleHandTracking = useCallback(() => {
    setIsHandTrackingOn(prev => {
      const next = !prev;
      localStorage.setItem('vivo_hand_tracking_enabled', next.toString());
      return next;
    });
  }, []);

  const toggleAudio = useCallback(() => {
    setIsAudioOn(prev => {
      const next = !prev;
      localStorage.setItem('vivo_pong_audio_enabled', next.toString());
      return next;
    });
  }, []);

  const toggleCRT = useCallback(() => {
    setIsCRTOn(prev => {
      const next = !prev;
      localStorage.setItem('vivo_pong_crt_enabled', next.toString());
      return next;
    });
  }, []);

  return (
    <div 
      ref={gameContainerRef} 
      className="relative w-full h-[100dvh] bg-[#0a0a0a] flex flex-col items-center font-mono text-white select-none touch-none overscroll-none overflow-hidden"
      style={{
        paddingTop: 'var(--sat, 0px)',
        paddingBottom: 'var(--sab, 0px)',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/10 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      {/* Hand Tracking Camera Layer (behind everything, z-0) */}
      {isHandTrackingOn && (
        <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
          <HandTrackingLayer
            onReady={() => {}}
            cursor={cursor}
            gesture={gesture}
            isHandActive={isHandActive}
            showVideo={true}
            showOverlay={true}
            isActive={true}
          />
        </div>
      )}

      {/* Top Banner (Header) — In normal flow so it's always visible on mobile */}
      <div className="flex-shrink-0 w-full p-2 sm:p-3 md:p-6 flex justify-between items-center z-[100] bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={() => navigate('/minigames')}
          className="group flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all backdrop-blur-xl cursor-pointer shadow-lg"
        >
          <ArrowLeft size={18} className="text-white group-hover:text-amber-400 group-hover:-translate-x-1 transition-all" />
          <span className="text-xs md:text-sm font-bold tracking-widest uppercase hidden md:inline">Lobby</span>
        </button>

        {/* Central Score + Title + Level */}
        <div className="flex items-center gap-3 sm:gap-6 md:gap-8 translate-x-1 sm:translate-x-0">
          <span className={`${playerSide === 'left' ? 'text-cyan-400' : 'text-fuchsia-400'} font-black text-2xl md:text-4xl drop-shadow-[0_0_10px_rgba(34,211,238,0.4)] italic select-none order-1`}>
            {playerSide === 'left' ? score.p1 : score.p2}
          </span>
          <div className="flex flex-col items-center order-2">
            <h1 className="text-lg md:text-2xl font-black tracking-[0.4em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none leading-none">
              VIVO
            </h1>
            <span className="text-[8px] md:text-[10px] font-bold text-cyan-400/60 tracking-[0.3em] uppercase mt-1">
              LOTE {level}
            </span>
          </div>
          <span className={`${playerSide === 'left' ? 'text-fuchsia-400' : 'text-cyan-400'} font-black text-2xl md:text-4xl drop-shadow-[0_0_10px_rgba(232,121,249,0.4)] italic select-none order-3`}>
            {playerSide === 'left' ? score.p2 : score.p1}
          </span>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Main Play/Pause/Start Control - Icon Only */}
          <button
            onClick={isPlaying ? togglePause : startGame}
            className={`flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-xl border transition-all backdrop-blur-xl cursor-pointer shadow-lg ${
              !isPlaying 
                ? 'bg-cyan-500/30 border-cyan-500/50 text-white animate-pulse shadow-[0_0_20px_rgba(34,211,238,0.3)]' 
                : (isPaused ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-green-500/20 border-green-500/50 text-green-300')
            }`}
          >
            {isPaused || !isPlaying ? (
              <Play size={20} fill="currentColor" />
            ) : (
              <Pause size={20} fill="currentColor" />
            )}
          </button>

          <div className="h-6 w-[1px] bg-white/10 mx-1 hidden md:block" />

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* CRT Toggle */}
            <button
              onClick={toggleCRT}
              title="Efecto CRT"
              className={`p-2 rounded-xl border transition-all backdrop-blur-xl cursor-pointer shadow-lg ${
                isCRTOn ? 'bg-amber-500/30 border-amber-500/50 text-amber-300' : 'bg-white/10 border-white/20 text-white/40'
              }`}
            >
              {isCRTOn ? <Monitor size={20} /> : <MonitorOff size={20} />}
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleAudio}
              title="Sonido"
              className={`p-2 rounded-xl border transition-all backdrop-blur-xl cursor-pointer shadow-lg ${
                isAudioOn ? 'bg-cyan-500/30 border-cyan-500/50 text-cyan-300' : 'bg-white/10 border-white/20 text-white/40'
              }`}
            >
              {isAudioOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {/* Hand Tracking Toggle */}
            <button
              onClick={toggleHandTracking}
              className={`flex items-center gap-2 p-2 md:px-3 md:py-2 rounded-xl border transition-all backdrop-blur-xl cursor-pointer shadow-lg ${
                isHandTrackingOn
                  ? 'bg-violet-500/30 border-violet-500/50 text-violet-200'
                  : 'bg-white/10 border-white/20 text-white/40 hover:text-white hover:bg-white/20'
              }`}
            >
              {isHandTrackingOn ? <Camera size={20} /> : <CameraOff size={20} />}
              <span className="text-xs font-bold uppercase tracking-wider hidden lg:inline">
                MANOS
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* In-game Score removed as per request (moved to header) */}

      {/* Main Game Container */}
      <div id="pong-game-area" className="relative z-30 flex-1 min-h-0 w-full flex items-center justify-center p-2">

        {/* Game Canvas */}
        <div 
          className={`relative rounded-xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-[#111] ${isCRTOn ? 'crt-distort' : ''}`}
          style={{ transform: `translate3d(${shakeOffset.x}px, ${shakeOffset.y}px, 0)` }}
        >
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="block touch-none w-full h-auto max-w-[95vw] max-h-[70vh] object-contain shadow-2xl"
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
          />
          
          {/* CRT Overlay Effects */}
          {isCRTOn && (
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
              <div className="absolute inset-0 animate-pulse opacity-20 bg-neutral-900/10 pointer-events-none" />
            </div>
          )}

          {/* Overlay: Not Playing or Winner */}
          {(!isPlaying || winner) && (
            <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4 py-6 md:p-6 overflow-y-auto ${window.innerHeight < 450 ? 'justify-start pt-16' : 'justify-center'}`}>

              {winner ? (
                <>
                  <h2 className={`text-4xl md:text-5xl font-black mb-2 uppercase ${winner === 'player' ? 'text-cyan-400' : 'text-fuchsia-400'}`}>
                    {winner === 'player' ? '¡HAS GANADO!' : 'CPU GANA'}
                  </h2>
                  <p className="text-white/50 mb-8 max-w-sm">
                    {winner === 'player'
                      ? 'Tus reflejos son impresionantes. ¿Listo para la revancha?'
                      : 'La máquina fue superior esta vez. Inténtalo de nuevo.'}
                  </p>

                  <button
                    onClick={startGame}
                    className="flex items-center gap-3 px-8 py-4 bg-white text-black hover:bg-amber-400 rounded-xl font-bold uppercase transition-colors cursor-pointer"
                  >
                    <RotateCcw size={20} />
                    Jugar de Nuevo
                  </button>
                </>
              ) : (
                <>
                  <div className={`${window.innerHeight < 450 ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-6'} bg-white/10 rounded-full flex items-center justify-center text-white/50`}>
                    <Gamepad2 size={window.innerHeight < 450 ? 20 : 32} />
                  </div>
                  <h2 className={`${window.innerHeight < 450 ? 'text-xl mb-2' : 'text-3xl mb-4'} font-bold uppercase tracking-[0.2em]`}>PONG RETRO</h2>
                  
                  <p className={`text-white/50 text-sm max-w-sm ${window.innerHeight < 450 ? 'mb-4' : 'mb-8'} leading-relaxed hidden sm:block`}>
                    Personaliza tu experiencia. Selecciona con qué mano/lado prefieres jugar:
                  </p>

                  <div className={`flex gap-3 md:gap-8 ${window.innerHeight < 450 ? 'mb-4' : 'mb-8'}`}>
                    <button
                      onClick={() => setPlayerSide('left')}
                      className={`flex flex-col items-center gap-2 md:gap-4 p-3 md:p-6 rounded-2xl border transition-all cursor-pointer w-28 md:w-44 group ${
                        playerSide === 'left' 
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.25)] scale-105' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:scale-102'
                      }`}
                    >
                      <div className={`${window.innerHeight < 450 ? 'w-10 h-10' : 'w-16 h-16 md:w-20 md:h-20'} flex items-center justify-center`}>
                        <div 
                          style={{ 
                            maskImage: `url(${IzquierdaIcon})`,
                            WebkitMaskImage: `url(${IzquierdaIcon})`,
                            maskSize: 'contain',
                            WebkitMaskSize: 'contain',
                            maskRepeat: 'no-repeat',
                            WebkitMaskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskPosition: 'center'
                          }}
                          className={`w-full h-full bg-current transition-transform duration-500 group-hover:scale-110 ${playerSide === 'left' ? 'animate-bounce-subtle' : ''}`}
                        />
                      </div>
                      <div className="text-[10px] md:text-sm font-black uppercase tracking-widest">Izquierda</div>
                    </button>

                    <button
                      onClick={() => setPlayerSide('right')}
                      className={`flex flex-col items-center gap-2 md:gap-4 p-3 md:p-6 rounded-2xl border transition-all cursor-pointer w-28 md:w-44 group ${
                        playerSide === 'right' 
                          ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-400 shadow-[0_0_30px_rgba(232,121,249,0.25)] scale-105' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:scale-102'
                      }`}
                    >
                      <div className={`${window.innerHeight < 450 ? 'w-10 h-10' : 'w-16 h-16 md:w-20 md:h-20'} flex items-center justify-center`}>
                        <div 
                          style={{ 
                            maskImage: `url(${DerechaIcon})`,
                            WebkitMaskImage: `url(${DerechaIcon})`,
                            maskSize: 'contain',
                            WebkitMaskSize: 'contain',
                            maskRepeat: 'no-repeat',
                            WebkitMaskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskPosition: 'center'
                          }}
                          className={`w-full h-full bg-current transition-transform duration-500 group-hover:scale-110 ${playerSide === 'right' ? 'animate-bounce-subtle' : ''}`}
                        />
                      </div>
                      <div className="text-[10px] md:text-sm font-black uppercase tracking-widest">Derecha</div>
                    </button>
                  </div>

                  <div className="space-y-4 mb-8">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest leading-relaxed">
                      Controles: <span className="text-white">Dedo/Ratón</span>, <span className="text-white">Flechas ↑↓</span>,
                      o <span className="text-violet-400">Cámara de Manos</span>.
                    </p>
                  </div>

                  <div className={`flex flex-col items-center gap-4 ${window.innerHeight < 450 ? 'pb-8' : 'pb-0'}`}>
                    {hasSavedGame ? (
                      <button
                        onClick={resumeGame}
                        className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-black uppercase transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(245,158,11,0.4)] cursor-pointer overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" />
                        <RotateCcw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
                        <div className="flex flex-col items-start leading-none">
                          <span className="text-sm tracking-widest">Resumir Partida</span>
                          <span className="text-[10px] opacity-70 mt-1">Nivel {level} • {score.p1}-{score.p2}</span>
                        </div>
                      </button>
                    ) : (
                      <>
                        <div className="animate-bounce text-amber-400">
                          <ArrowLeft className="rotate-90" size={24} />
                        </div>
                        <p className="text-amber-400 font-bold uppercase tracking-widest text-[8px] md:text-[10px]">Pulse EMPEZAR arriba para iniciar</p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hand Tracking Active Indicator */}
      {isHandTrackingOn && isPlaying && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-full backdrop-blur-md">
          <Camera size={14} className="text-violet-400" />
          <span className="text-[10px] text-violet-300 font-bold uppercase tracking-widest">
            {isHandActive ? 'Mano Detectada' : 'Buscando Mano...'}
          </span>
          <div className={`w-2 h-2 rounded-full ${isHandActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
        </div>
      )}
      <style>{`
        .crt-distort {
          filter: contrast(1.2) brightness(1.1);
        }
        .crt-distort::after {
          content: " ";
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: rgba(18, 16, 16, 0.1);
          opacity: 0;
          z-index: 2;
          pointer-events: none;
          animation: flicker 0.1s infinite;
        }
        @keyframes flicker {
          0% { opacity: 0.27861; }
          5% { opacity: 0.34769; }
          10% { opacity: 0.23604; }
          15% { opacity: 0.90626; }
          20% { opacity: 0.18128; }
          25% { opacity: 0.83891; }
          30% { opacity: 0.65583; }
          35% { opacity: 0.57807; }
          40% { opacity: 0.26559; }
          45% { opacity: 0.84693; }
          50% { opacity: 0.96019; }
          55% { opacity: 0.08594; }
          60% { opacity: 0.20313; }
          65% { opacity: 0.41988; }
          70% { opacity: 0.53455; }
          75% { opacity: 0.37288; }
          80% { opacity: 0.71428; }
          85% { opacity: 0.70419; }
          90% { opacity: 0.7003; }
          95% { opacity: 0.36108; }
          100% { opacity: 0.24387; }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};
