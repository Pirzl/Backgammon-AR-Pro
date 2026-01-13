
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

const THEME = {
  pointLight: '#A88B66',
  pointDark: '#2C1D14',
  whiteChecker: ['#FFFFFF', '#E0E0E0'],
  redChecker: ['#FF3B30', '#991100'],
  gold: '#fbbf24'
};

// Generador de sonidos sintéticos para evitar dependencias de archivos externos
const playSound = (type: 'clack' | 'dice') => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (type === 'clack') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else {
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
};

const getInitialState = () => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] }));
  const add = (idx: number, n: number, col: string) => { for (let i = 0; i < n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return {
    points: p, bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null,
    gameMode: 'LOCAL', userColor: 'white', roomID: ''
  };
};

const App = () => {
  const [view, setView] = useState('HOME');
  const [state, setState] = useState(getInitialState());
  const [camOpacity, setCamOpacity] = useState(0.4);
  const [boardOpacity, setBoardOpacity] = useState(0.9);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [handPos, setHandPos] = useState<{ x: number, y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastHandClickRef = useRef<number>(0);

  // --- LÓGICA DE COORDENADAS CON ROTACIÓN ---
  const getPointCoords = (i: number) => {
    // Si está rotado, invertimos el índice del punto visualmente
    const visualIdx = isRotated ? 23 - i : i;
    const isTop = visualIdx >= 12;
    const col = isTop ? visualIdx - 12 : 11 - visualIdx;
    const xBase = 110 + col * 80;
    const x = col >= 6 ? xBase + 60 : xBase;
    return { x, yBase: isTop ? 50 : 750, yTip: isTop ? 380 : 420, isTop };
  };

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isSelected = false) => {
    const colors = color === 'white' ? THEME.whiteChecker : THEME.redChecker;
    const grad = ctx.createRadialGradient(x - 8, y - 8, 2, x, y, 22);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = 35;
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1; ctx.stroke();
  };

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Fondo Tablero
    ctx.fillStyle = `rgba(10, 10, 10, ${boardOpacity})`;
    ctx.fillRect(50, 50, CANVAS_WIDTH - 100, CANVAS_HEIGHT - 100);
    
    // Puntos
    for (let i = 0; i < 24; i++) {
      const { x, yBase, yTip, isTop } = getPointCoords(i);
      // Alternar color de los triángulos basándonos en el índice real para que la lógica de juego no cambie
      ctx.fillStyle = (i % 2 === 0 ? THEME.pointDark : THEME.pointLight);
      ctx.beginPath();
      ctx.moveTo(x - 36, yBase); ctx.lineTo(x + 36, yBase); ctx.lineTo(x, yTip);
      ctx.fill();

      state.points[i].checkers.forEach((col: string, j: number) => {
        const y = isTop ? 95 + (j * 44) : 705 - (j * 44);
        const isThisSelected = selectedPoint === i && j === state.points[i].checkers.length - 1;
        drawChecker(ctx, x, y, col, isThisSelected);
      });
    }

    // Barra central
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(CANVAS_WIDTH/2 - 30, 50, 60, CANVAS_HEIGHT - 100);
    ['white', 'red'].forEach((col, idx) => {
      for(let i=0; i<state.bar[col]; i++) {
        // En la barra, blanco arriba y rojo abajo normalmente, pero si rotamos lo invertimos visualmente
        const isWhiteOnTop = !isRotated;
        const basePos = (col === 'white') === isWhiteOnTop ? 250 : 550;
        const direction = (col === 'white') === isWhiteOnTop ? -1 : 1;
        const y = basePos + (i * 42 * direction);
        drawChecker(ctx, CANVAS_WIDTH/2, y, col, selectedPoint === 'bar' && col === state.turn);
      }
    });

    // Dados de colores según el turno
    state.dice.forEach((d, i) => {
      const dx = CANVAS_WIDTH/2 - 130 + (i * 180), dy = CANVAS_HEIGHT/2 - 45;
      const diceColor = state.turn === 'white' ? '#fff' : '#FF3B30';
      const textColor = state.turn === 'white' ? '#000' : '#fff';
      
      ctx.fillStyle = diceColor;
      ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); 
      (ctx as any).roundRect ? (ctx as any).roundRect(dx, dy, 90, 90, 15) : ctx.fillRect(dx, dy, 90, 90);
      ctx.fill(); ctx.shadowBlur = 0;
      
      ctx.fillStyle = textColor; ctx.font = '900 48px Inter'; ctx.textAlign = 'center';
      ctx.fillText(d.toString(), dx + 45, dy + 62);
    });

    // Puntero de mano AR
    if (handPos) {
      ctx.save();
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = 15;
      ctx.fillStyle = THEME.gold;
      ctx.beginPath(); ctx.arc(handPos.x, handPos.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
  }, [state, selectedPoint, boardOpacity, handPos, isRotated]);

  useEffect(() => {
    const anim = requestAnimationFrame(render);
    return () => cancelAnimationFrame(anim);
  }, [render]);

  // --- HAND TRACKING INTEGRATION ---
  useEffect(() => {
    if (view !== 'PLAYING') return;

    const hands = new (window as any).Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    hands.onResults((results: any) => {
      if (results.multiHandLandmarks?.length > 0) {
        const landmark = results.multiHandLandmarks[0][8]; // Punta del índice
        const x = (1 - landmark.x) * CANVAS_WIDTH;
        const y = landmark.y * CANVAS_HEIGHT;
        setHandPos({ x, y });

        // Simular clic si el dedo se mantiene quieto o si hay un gesto (usaremos proximidad temporal)
        const now = Date.now();
        if (now - lastHandClickRef.current > 1200) { // Un clic cada 1.2s para evitar spam
          // Comprobar si está sobre algo interactuable
          handleInteraction(x, y);
          lastHandClickRef.current = now;
        }
      } else {
        setHandPos(null);
      }
    });

    const camera = new (window as any).Camera(videoRef.current, {
      onFrame: async () => { if(hands) await hands.send({ image: videoRef.current! }); },
      width: 640, height: 480
    });
    camera.start();

    return () => camera.stop();
  }, [view]);

  // --- LÓGICA DE IA ---
  useEffect(() => {
    if (state.turn === 'red' && state.gameMode === 'AI' && !state.winner) {
      setTimeout(() => {
        const ns = JSON.parse(JSON.stringify(state));
        if (ns.dice.length === 0) {
          rollDice();
          return;
        }

        let moved = false;
        for (const die of ns.movesLeft) {
          if (ns.bar.red > 0) {
            const target = die - 1;
            if (ns.points[target].checkers.length <= 1 || ns.points[target].checkers[0] === 'red') {
              executeMove('bar', target, die, true); moved = true; break;
            }
          } else {
            for (let i = 0; i < 24; i++) {
              if (ns.points[i].checkers.includes('red')) {
                const target = i + die;
                if (target < 24 && (ns.points[target].checkers.length <= 1 || ns.points[target].checkers[0] === 'red')) {
                  executeMove(i, target, die, true); moved = true; break;
                }
              }
            }
          }
          if (moved) break;
        }
        if (!moved) { 
          setState(s => ({ ...s, turn: 'white', dice: [], movesLeft: [] }));
        }
      }, 1200);
    }
  }, [state.turn, state.dice, state.gameMode]);

  const rollDice = () => {
    playSound('dice');
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setState(s => ({
      ...s, 
      dice: [d1, d2], 
      movesLeft: d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]
    }));
  };

  const handleInteraction = (x: number, y: number) => {
    // Detectar barra central
    if (Math.abs(x - CANVAS_WIDTH/2) < 40) {
      if (state.bar[state.turn] > 0) setSelectedPoint('bar');
      return;
    }

    // Detectar puntos
    let clickedPoint = -1;
    for (let i = 0; i < 24; i++) {
      const p = getPointCoords(i);
      if (Math.abs(x - p.x) < 45 && ((p.isTop && y < 400) || (!p.isTop && y > 400))) {
        clickedPoint = i;
        break;
      }
    }

    if (clickedPoint !== -1) {
      if (selectedPoint !== null) {
        // Intentar mover
        const die = state.movesLeft.find(d => {
          const target = selectedPoint === 'bar' 
            ? (state.turn === 'red' ? d - 1 : 24 - d)
            : (state.turn === 'red' ? selectedPoint + d : selectedPoint - d);
          return target === clickedPoint;
        });

        if (die) {
          executeMove(selectedPoint, clickedPoint, die);
        } else if (state.points[clickedPoint].checkers.includes(state.turn)) {
          setSelectedPoint(clickedPoint);
        }
      } else if (state.points[clickedPoint].checkers.includes(state.turn)) {
        setSelectedPoint(clickedPoint);
      }
    }
  };

  const executeMove = (from: number | 'bar', to: number, die: number, isAI = false) => {
    playSound('clack');
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      const p = ns.turn;
      
      if (from === 'bar') ns.bar[p]--;
      else ns.points[from].checkers.pop();

      const dest = ns.points[to];
      if (dest.checkers.length === 1 && dest.checkers[0] !== p) {
        ns.bar[dest.checkers[0]]++;
        dest.checkers = [p];
      } else {
        dest.checkers.push(p);
      }

      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.movesLeft.length === 0) {
        ns.turn = ns.turn === 'white' ? 'red' : 'white';
        ns.dice = [];
      }
      return ns;
    });
    if (!isAI) setSelectedPoint(null);
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden select-none">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform scaleX(-1)" style={{ opacity: camOpacity }} />
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT} 
        onClick={(e) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
          const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
          handleInteraction(x, y);
        }} 
        className="absolute inset-0 w-full h-full z-10 cursor-pointer" 
      />
      
      {/* CAPA UI */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        
        {/* HEADER */}
        {view === 'PLAYING' && (
          <header className="h-24 flex items-center justify-between px-10 pointer-events-auto">
            <button onClick={() => setIsMenuOpen(true)} className="w-14 h-14 flex flex-col justify-center items-center gap-1.5 active:scale-90 transition-all bg-black/20 rounded-full">
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
            </button>
            
            <div className={`px-12 py-3 rounded-full font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 ${state.turn === state.userColor ? 'bg-amber-500 text-black border-2 border-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.5)]' : 'bg-white/10 text-white/40 border border-white/5'}`}>
              {state.turn === state.userColor ? 'TU TURNO' : 'TURNO RIVAL'}
            </div>

            <button 
              onClick={rollDice}
              disabled={state.movesLeft.length > 0 || (state.gameMode === 'AI' && state.turn === 'red')}
              className="px-12 py-3 bg-white text-black font-black rounded-full text-xs uppercase shadow-2xl disabled:opacity-20 active:scale-95 transition-all pointer-events-auto"
            >
              LANZAR
            </button>
          </header>
        )}

        {/* MENU LATERAL OPCIONES */}
        <div className={`side-menu absolute left-0 top-0 bottom-0 w-[350px] bg-zinc-950/95 border-r border-white/10 p-10 transform transition-transform duration-500 ease-in-out pointer-events-auto shadow-[20px_0_60px_rgba(0,0,0,0.8)] ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex justify-between items-center mb-16">
            <h2 className="text-4xl font-black italic tracking-tighter text-white">OPCIONES</h2>
            <button onClick={() => setIsMenuOpen(false)} className="w-12 h-12 bg-red-600 hover:bg-red-500 rounded-2xl flex items-center justify-center font-bold text-xl text-white transition-colors">✕</button>
          </div>
          
          <div className="space-y-12 flex-1">
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Opacidad Tablero</span>
                <span className="text-sm font-black text-amber-500">{Math.round(boardOpacity*100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={boardOpacity} onChange={e => setBoardOpacity(parseFloat(e.target.value))} className="w-full" />
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Opacidad Cámara</span>
                <span className="text-sm font-black text-amber-500">{Math.round(camOpacity*100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={camOpacity} onChange={e => setCamOpacity(parseFloat(e.target.value))} className="w-full" />
            </div>

            <button 
              onClick={() => setIsRotated(!isRotated)}
              className="w-full py-5 rounded-2xl border border-white/10 bg-white/5 font-black uppercase text-xs text-white/80 hover:bg-white/10 transition-all flex items-center justify-center gap-3"
            >
              <svg className={`w-5 h-5 transition-transform duration-500 ${isRotated ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Rotar Tablero (180°)
            </button>

            <button 
              onClick={() => { setState(getInitialState()); setIsMenuOpen(false); playSound('dice'); }} 
              className="w-full py-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 font-black uppercase text-xs text-amber-500 hover:bg-amber-500/20 transition-all"
            >
              Reiniciar Partida
            </button>
          </div>
          
          <button onClick={() => window.location.reload()} className="mt-auto w-full py-5 rounded-2xl border border-white/10 font-black uppercase text-xs text-white/30 hover:text-white/60 transition-all">Salir al Menú Principal</button>
        </div>

        {/* HOME MENU */}
        {view === 'HOME' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-8 bg-black z-50 p-6 pointer-events-auto">
            <div className="relative mb-20">
               <h1 className="text-[120px] font-black italic tracking-tighter uppercase leading-[0.8] text-white">B-GAMMON AR</h1>
               <div className="absolute -bottom-4 right-0 px-4 py-1 bg-amber-500 text-black font-black text-xs skew-x-[-15deg]">PREMIUM EDITION</div>
            </div>
            
            <button onClick={() => { setState(s => ({...s, gameMode: 'AI'})); setView('PLAYING'); }} className="w-[480px] py-10 bg-white text-black font-black rounded-3xl uppercase text-2xl shadow-[0_20px_50px_rgba(255,255,255,0.2)] active:scale-95 transition-all hover:scale-[1.02]">VS MÁQUINA</button>
            <button onClick={() => { /* Proximamente P2P */ }} className="w-[480px] py-10 bg-zinc-800 text-white font-black rounded-3xl uppercase text-2xl active:scale-95 transition-all opacity-50 cursor-not-allowed">MULTIJUGADOR ONLINE</button>
            <button onClick={() => { setState(getInitialState()); setView('PLAYING'); }} className="w-[480px] py-8 bg-zinc-900 text-white/40 font-black rounded-3xl uppercase text-sm active:scale-95 transition-all hover:text-white/80">LOCAL (2 JUGADORES)</button>
          </div>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
