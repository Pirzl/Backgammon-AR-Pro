
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- CONFIGURACIÓN ---
const CANVAS_WIDTH = 1300;
const CANVAS_HEIGHT = 800;
const PINCH_THRESHOLD = 0.045; 
const SMOOTHING_FACTOR = 0.4; // Factor de suavizado para evitar vibraciones (Jitter)

const THEME = {
  pointLight: '#A88B66',
  pointDark: '#2C1D14',
  whiteChecker: ['#FFFFFF', '#E0E0E0'],
  redChecker: ['#FF3B30', '#991100'],
  gold: '#fbbf24',
  success: '#22c55e'
};

const playSound = (type: 'clack' | 'dice' | 'win' | 'grab') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (type === 'clack') {
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    } else if (type === 'grab') {
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    } else if (type === 'win') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    }
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.2);
  } catch(e) {}
};

const getInitialState = () => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as string[] }));
  const add = (idx: number, n: number, col: string) => { for (let i = 0; i < n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return {
    points: p, bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white' as 'white' | 'red', dice: [] as number[], movesLeft: [] as number[], winner: null as string | null,
    gameMode: 'LOCAL' as 'LOCAL' | 'CPU' | 'ONLINE', roomID: 'B7X2Y9'
  };
};

const App = () => {
  const [view, setView] = useState('HOME');
  const [state, setState] = useState(getInitialState());
  const [camOpacity, setCamOpacity] = useState(0.5);
  const [boardOpacity, setBoardOpacity] = useState(0.85);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [handPos, setHandPos] = useState<{ x: number, y: number, isPinching: boolean, source: 'hand' | 'mouse' } | null>(null);
  const [myColor] = useState<'white' | 'red'>('white');
  const [isCopied, setIsCopied] = useState(false);
  
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle');
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');

  const stateRef = useRef(state);
  const selectedPointRef = useRef<number | 'bar' | null>(null);
  const [selectedPointUI, setSelectedPointUI] = useState<number | 'bar' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wasPinchingRef = useRef(false);
  const cpuProcessingRef = useRef(false);
  
  const smoothedPosRef = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });

  useEffect(() => { stateRef.current = state; }, [state]);

  const getPointCoords = (i: number) => {
    const isTop = i >= 12;
    const col = isTop ? i - 12 : 11 - i;
    const xBase = 110 + col * 80;
    const x = col >= 6 ? xBase + 60 : xBase;
    return { x, yBase: isTop ? 50 : 750, yTip: isTop ? 350 : 450, isTop };
  };

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isSelected = false) => {
    const colors = color === 'white' ? THEME.whiteChecker : THEME.redChecker;
    const radius = 22;
    const grad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, radius);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = 25;
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.stroke();
  };

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const boardWidth = CANVAS_WIDTH - 150;
    const barX = boardWidth / 2 + 50;

    // Fondo Tablero
    ctx.fillStyle = `rgba(10, 10, 10, ${boardOpacity})`;
    ctx.fillRect(50, 50, boardWidth, CANVAS_HEIGHT - 100);
    
    // Puntos
    for (let i = 0; i < 24; i++) {
      const { x, yBase, yTip, isTop } = getPointCoords(i);
      ctx.fillStyle = (i % 2 === 0 ? THEME.pointDark : THEME.pointLight);
      ctx.beginPath();
      ctx.moveTo(x - 36, yBase); ctx.lineTo(x + 36, yBase); ctx.lineTo(x, yTip);
      ctx.fill();

      state.points[i].checkers.forEach((col, j) => {
        const y = isTop ? 95 + (j * 42) : 705 - (j * 42);
        const isThisSelected = selectedPointUI === i && j === state.points[i].checkers.length - 1;
        drawChecker(ctx, x, y, col, isThisSelected);
      });
    }

    // Barra
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(barX - 30, 50, 60, CANVAS_HEIGHT - 100);
    ['white', 'red'].forEach((col) => {
      const count = state.bar[col as 'white'|'red'];
      for(let i=0; i<count; i++) {
        const y = (col === 'white' ? 150 : 650) + (i * 44 * (col === 'white' ? 1 : -1));
        drawChecker(ctx, barX, y, col, selectedPointUI === 'bar' && col === state.turn);
      }
    });

    // Zona Bearing Off
    const offX = boardWidth + 100;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(offX - 40, 50, 80, CANVAS_HEIGHT - 100);
    ['white', 'red'].forEach(col => {
        const count = state.off[col as 'white'|'red'];
        const baseY = col === 'white' ? 750 : 50;
        const dir = col === 'white' ? -1 : 1;
        for(let i=0; i<count; i++) {
            ctx.fillStyle = col === 'white' ? '#FFF' : '#FF3B30';
            ctx.fillRect(offX - 30, baseY + (i * 12 * dir), 60, 10);
        }
    });

    // Dados
    state.dice.forEach((d, i) => {
      const dx = barX - 100 + (i * 120), dy = CANVAS_HEIGHT/2 - 40;
      ctx.fillStyle = state.turn === 'white' ? '#fff' : '#FF3B30';
      ctx.beginPath(); ctx.roundRect?.(dx, dy, 80, 80, 12); ctx.fill();
      ctx.fillStyle = state.turn === 'white' ? '#000' : '#fff';
      ctx.font = '900 40px Inter'; ctx.textAlign = 'center';
      ctx.fillText(d.toString(), dx + 40, dy + 55);
    });

    // Puntero AR
    if (handPos) {
      ctx.save();
      ctx.shadowColor = handPos.isPinching ? THEME.gold : '#fff';
      ctx.shadowBlur = handPos.isPinching ? 30 : 15;
      ctx.fillStyle = handPos.isPinching ? THEME.gold : 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(handPos.x, handPos.y, handPos.isPinching ? 22 : 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }, [state, selectedPointUI, boardOpacity, handPos]);

  useEffect(() => {
    const anim = requestAnimationFrame(render);
    return () => cancelAnimationFrame(anim);
  }, [render]);

  useEffect(() => {
    if (state.gameMode === 'CPU' && state.turn === 'red' && !state.winner && !cpuProcessingRef.current) {
        const cpuLogic = async () => {
            cpuProcessingRef.current = true;
            await new Promise(r => setTimeout(r, 1200));
            if (state.dice.length === 0) {
                rollDice();
                cpuProcessingRef.current = false;
                return;
            }
            let moved = false;
            const currentMoves = [...state.movesLeft].sort((a,b) => b-a);
            for (const die of currentMoves) {
                if (state.bar.red > 0) {
                    const target = die - 1;
                    if (isValidMove('red', 'bar', target)) {
                        executeMove('bar', target, die);
                        moved = true; break;
                    }
                } else {
                    for (let i = 0; i < 24; i++) {
                        if (state.points[i].checkers.includes('red')) {
                            const target = i + die;
                            if (target < 24 && isValidMove('red', i, target)) {
                                executeMove(i, target, die);
                                moved = true; break;
                            } else if (target >= 24 && canBearOff('red')) {
                                executeMove(i, 'off', die);
                                moved = true; break;
                            }
                        }
                    }
                }
                if (moved) break;
            }
            if (!moved) setState(s => ({...s, turn: 'white', dice: [], movesLeft: []}));
            cpuProcessingRef.current = false;
        };
        cpuLogic();
    }
  }, [state.turn, state.dice, state.movesLeft]);

  const requestCamera = async () => {
    setCameraStatus('requesting');
    setCameraErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setCameraStatus('ready');
    } catch (err: any) {
      setCameraStatus('error');
      setCameraErrorMsg(err.name === 'NotAllowedError' ? 'Permiso denegado. Actívalo en Safari/Chrome.' : 'Error de cámara.');
    }
  };

  useEffect(() => {
    if (view === 'PLAYING' && cameraStatus === 'idle') requestCamera();
  }, [view, cameraStatus]);

  useEffect(() => {
    if (view !== 'PLAYING' || cameraStatus !== 'ready') return;

    const hands = new (window as any).Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    // CONFIGURACIÓN DE ALTO NIVEL (GOOGLE AI EDGE)
    hands.setOptions({ 
      maxNumHands: 1, 
      modelComplexity: 1, 
      minDetectionConfidence: 0.75, 
      minTrackingConfidence: 0.75,
      selfieMode: true // EL MODO SELFIE HACE QUE LA COORDENADA X COINCIDA CON EL ESPEJO
    });

    hands.onResults((results: any) => {
      if (results.multiHandLandmarks?.length > 0) {
        const marks = results.multiHandLandmarks[0];
        const tip = marks[8]; const thumb = marks[4];
        
        const dist = Math.sqrt(Math.pow(tip.x - thumb.x, 2) + Math.pow(tip.y - thumb.y, 2));
        const isPinching = dist < PINCH_THRESHOLD;

        // COORDINACIÓN CORRECTA CON SELFIE MODE ACTIVADO
        const targetX = tip.x * CANVAS_WIDTH; 
        const targetY = tip.y * CANVAS_HEIGHT;
        
        // FILTRO EMA PARA ESTABILIDAD
        smoothedPosRef.current.x = smoothedPosRef.current.x * (1 - SMOOTHING_FACTOR) + targetX * SMOOTHING_FACTOR;
        smoothedPosRef.current.y = smoothedPosRef.current.y * (1 - SMOOTHING_FACTOR) + targetY * SMOOTHING_FACTOR;

        const x = smoothedPosRef.current.x;
        const y = smoothedPosRef.current.y;

        setHandPos({ x, y, isPinching, source: 'hand' });

        if (isPinching && !wasPinchingRef.current) {
            playSound('grab');
            handlePinchStart(x, y);
        } else if (!isPinching && wasPinchingRef.current) {
            handlePinchEnd(x, y);
        }
        wasPinchingRef.current = isPinching;
      } else {
        // Solo quitamos el handPos si la fuente era 'hand', para no romper el ratón
        setHandPos(prev => prev?.source === 'hand' ? null : prev);
        wasPinchingRef.current = false;
      }
    });

    const camera = new (window as any).Camera(videoRef.current, {
      onFrame: async () => { if(videoRef.current) await hands.send({ image: videoRef.current }); },
      width: 1280, height: 720
    });
    
    camera.start().catch(() => setCameraStatus('error'));

    return () => { camera.stop(); hands.close(); };
  }, [view, cameraStatus]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    setHandPos({ x, y, isPinching: true, source: 'mouse' });
    handlePinchStart(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (handPos?.source === 'mouse') {
          const rect = canvasRef.current!.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
          const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
          setHandPos({ x, y, isPinching: true, source: 'mouse' });
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    handlePinchEnd(x, y);
    setHandPos(null);
  };

  const handlePinchStart = (x: number, y: number) => {
    const s = stateRef.current;
    if (s.turn !== myColor && s.gameMode !== 'LOCAL') return;
    
    // Lanzar dados si se toca la zona central
    if (x > 500 && x < 800 && y > 300 && y < 500) {
        if (s.movesLeft.length === 0) rollDice();
        return;
    }
    
    let hit: number | 'bar' | null = null;
    const barX = (CANVAS_WIDTH - 150) / 2 + 50;
    if (Math.abs(x - barX) < 60) {
        if (s.bar[s.turn] > 0) hit = 'bar';
    } else {
        for (let i = 0; i < 24; i++) {
            const p = getPointCoords(i);
            if (Math.abs(x - p.x) < 50 && ((p.isTop && y < 400) || (!p.isTop && y > 400))) {
                if (s.points[i].checkers.includes(s.turn)) {
                    if (s.bar[s.turn] > 0) return;
                    hit = i;
                }
                break;
            }
        }
    }
    selectedPointRef.current = hit;
    setSelectedPointUI(hit);
  };

  const handlePinchEnd = (x: number, y: number) => {
    const from = selectedPointRef.current;
    const s = stateRef.current;
    if (from === null) return;
    
    let to: number | 'off' | null = null;
    if (x > CANVAS_WIDTH - 150) to = 'off';
    else {
        for (let i = 0; i < 24; i++) {
            const p = getPointCoords(i);
            if (Math.abs(x - p.x) < 50 && ((p.isTop && y < 400) || (!p.isTop && y > 400))) {
                to = i;
                break;
            }
        }
    }
    
    if (to !== null) {
        const die = s.movesLeft.find(d => {
            if (to === 'off') {
                const dist = s.turn === 'white' ? (from as number) + 1 : 24 - (from as number);
                return d >= dist;
            }
            const target = from === 'bar' 
                ? (s.turn === 'red' ? d - 1 : 24 - d)
                : (s.turn === 'red' ? (from as number) + d : (from as number) - d);
            return target === to;
        });
        if (die && isValidMove(s.turn, from, to)) executeMove(from, to, die);
    }
    selectedPointRef.current = null;
    setSelectedPointUI(null);
  };

  const isValidMove = (p: string, from: number | 'bar', to: number | 'off') => {
      const s = stateRef.current;
      if (to === 'off') return canBearOff(p as any);
      const playerBar = s.bar[p as 'white'|'red'];
      if (from !== 'bar' && playerBar > 0) return false;
      const dest = s.points[to];
      return dest.checkers.length <= 1 || dest.checkers[0] === p;
  };

  const rollDice = () => {
    playSound('dice');
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const rolls = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    setState(s => ({ ...s, dice: [d1, d2], movesLeft: rolls }));
  };

  const executeMove = (from: number | 'bar', to: number | 'off', die: number) => {
    playSound('clack');
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      const p = ns.turn as 'white'|'red';
      if (from === 'bar') ns.bar[p]--; else ns.points[from].checkers.pop();
      if (to === 'off') ns.off[p]++;
      else {
          const dest = ns.points[to];
          if (dest.checkers.length === 1 && dest.checkers[0] !== p) { 
            const opponent = dest.checkers[0] as 'white'|'red';
            ns.bar[opponent]++; 
            dest.checkers = [p]; 
          }
          else dest.checkers.push(p);
      }
      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; }
      if (ns.off.white === 15) ns.winner = 'white'; if (ns.off.red === 15) ns.winner = 'red';
      return ns;
    });
  };

  const canBearOff = (player: 'white' | 'red') => {
      const s = stateRef.current;
      const homePoints = player === 'white' ? [0,1,2,3,4,5] : [18,19,20,21,22,23];
      return s.points.every((p, i) => homePoints.includes(i) || !p.checkers.includes(player)) && s.bar[player] === 0;
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden select-none">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform scaleX(-1)" style={{ opacity: camOpacity }} />
      
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute inset-0 w-full h-full z-10 cursor-crosshair touch-none" 
      />
      
      <div className="absolute inset-0 z-20 pointer-events-none">
        
        {view === 'PLAYING' && cameraStatus === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-[100] pointer-events-auto p-10">
                <div className="glass-panel max-w-xl w-full p-12 rounded-[40px] text-center">
                    <h2 className="text-3xl font-black text-white mb-4 uppercase italic">Error de Cámara</h2>
                    <p className="text-white/60 mb-10">{cameraErrorMsg}</p>
                    <button onClick={requestCamera} className="w-full py-6 bg-amber-500 text-black font-black rounded-2xl uppercase shadow-xl active:scale-95 transition-all">Reintentar</button>
                    <button onClick={() => { setView('HOME'); setCameraStatus('idle'); }} className="mt-4 text-white/40 uppercase text-xs font-bold hover:text-white transition-all">Cerrar</button>
                </div>
            </div>
        )}

        {view === 'PLAYING' && cameraStatus === 'requesting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-[90]">
                <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-white font-black uppercase tracking-[0.3em] text-xs">Sincronizando AR...</p>
            </div>
        )}

        {view === 'PLAYING' && (
          <header className="h-24 flex items-center justify-between px-10 pointer-events-auto">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} 
              className="w-16 h-16 glass-panel flex flex-col justify-center items-center gap-2 rounded-full active:scale-90 transition-all z-[100] cursor-pointer"
            >
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
            </button>
            <div className={`px-12 py-3 rounded-full font-black text-sm transition-all ${state.turn === myColor ? 'bg-amber-500 text-black shadow-[0_0_30px_rgba(251,191,36,0.6)]' : 'bg-white/10 text-white/40'}`}>
              {state.turn === 'white' ? 'TU TURNO (BLANCO)' : 'TURNO RIVAL (ROJO)'}
            </div>
            <button onClick={rollDice} disabled={state.movesLeft.length > 0} className="px-12 py-3 bg-white text-black font-black rounded-full text-xs uppercase disabled:opacity-20 active:scale-95 transition-all pointer-events-auto">LANZAR</button>
          </header>
        )}

        <div className={`side-menu absolute left-0 top-0 bottom-0 w-[380px] glass-panel p-10 transform transition-transform duration-500 ease-in-out pointer-events-auto z-40 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex justify-between items-center mb-16 mt-20">
            <h2 className="text-4xl font-black italic text-white tracking-tighter uppercase">AJUSTES</h2>
          </div>
          <div className="space-y-12">
            <div className="space-y-6">
              <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">AR Visuals</span>
              <div className="space-y-8">
                <div>
                  <label className="text-xs text-white/60 mb-2 block font-bold">Opacidad Tablero</label>
                  <input type="range" min="0" max="1" step="0.05" value={boardOpacity} onChange={e => setBoardOpacity(parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-2 block font-bold">Opacidad Cámara</label>
                  <input type="range" min="0" max="1" step="0.05" value={camOpacity} onChange={e => setCamOpacity(parseFloat(e.target.value))} className="w-full" />
                </div>
              </div>
            </div>
            <button 
              onClick={() => { setView('HOME'); setState(getInitialState()); setIsMenuOpen(false); setCameraStatus('idle'); }} 
              className="w-full py-6 rounded-2xl bg-red-600/20 border border-red-600/40 font-black uppercase text-xs text-red-500 hover:bg-red-600/30 transition-all"
            >
              Salir de Partida
            </button>
          </div>
        </div>

        {view === 'LOBBY' && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-50 p-6 pointer-events-auto">
             <div className="glass-panel p-12 rounded-[40px] text-center max-w-lg w-full border-amber-500/20 shadow-2xl">
                <h2 className="text-4xl font-black mb-4 text-white italic tracking-tighter uppercase">SALA ONLINE</h2>
                <div className="bg-white/5 p-10 rounded-3xl border border-white/10 mb-10 group hover:border-amber-500/50 transition-all">
                    <span className="text-7xl font-black text-amber-500 tracking-tighter select-all">{state.roomID}</span>
                </div>
                <button onClick={() => { setIsCopied(true); navigator.clipboard.writeText(state.roomID); setTimeout(() => setIsCopied(false), 2000); }} 
                        className={`w-full py-7 font-black rounded-2xl uppercase transition-all duration-300 transform shadow-xl ${isCopied ? 'bg-green-500 text-white scale-105' : 'bg-amber-500 text-black hover:scale-[1.02]'}`}>
                    {isCopied ? '¡COPIADO! ✓' : 'COPIAR ID DE SALA'}
                </button>
                <button onClick={() => { setView('PLAYING'); setState(s => ({...s, gameMode: 'ONLINE'})); }} className="mt-8 text-white/40 uppercase text-xs font-bold hover:text-white transition-colors tracking-widest">EMPEZAR PARTIDA</button>
                <button onClick={() => setView('HOME')} className="mt-4 block mx-auto text-white/20 text-[10px] uppercase font-bold hover:text-white">VOLVER</button>
             </div>
           </div>
        )}

        {view === 'HOME' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-8 bg-black z-[60] p-6 pointer-events-auto">
            <h1 className="text-[100px] font-black italic tracking-tighter uppercase text-white leading-none mb-10 text-center">B-GAMMON AR</h1>
            <button onClick={() => { setView('PLAYING'); setState(s => ({...s, gameMode: 'CPU'})); setIsMenuOpen(false); }} className="w-[500px] max-w-full py-9 bg-white text-black font-black rounded-3xl uppercase text-2xl shadow-2xl active:scale-95 hover:bg-amber-500 transition-all">CONTRA CPU</button>
            <button onClick={() => { setView('PLAYING'); setState(s => ({...s, gameMode: 'LOCAL'})); setIsMenuOpen(false); }} className="w-[500px] max-w-full py-9 bg-zinc-900 border border-white/10 text-white font-black rounded-3xl uppercase text-2xl active:scale-95 hover:border-white/40 transition-all">2 JUGADORES (LOCAL)</button>
            <button onClick={() => setView('LOBBY')} className="w-[500px] max-w-full py-5 text-white/30 font-bold uppercase text-xs hover:text-amber-500 transition-colors tracking-[0.2em]">MULTIJUGADOR ONLINE</button>
          </div>
        )}

        {state.winner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-[100] pointer-events-auto">
                <h2 className="text-[80px] font-black italic text-white mb-8 uppercase tracking-tighter">¡GANÓ {state.winner === 'white' ? 'BLANCO' : 'ROJO'}!</h2>
                <button onClick={() => window.location.reload()} className="px-16 py-8 bg-amber-500 text-black font-black rounded-3xl uppercase text-2xl">VOLVER AL INICIO</button>
            </div>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
