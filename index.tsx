
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

const getInitialState = () => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] }));
  const add = (idx, n, col) => { for (let i = 0; i < n; i++) p[idx].checkers.push(col); };
  // Setup Clásico
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
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [handCoords, setHandCoords] = useState(null);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // --- LÓGICA DE DIBUJO ---
  const getPointCoords = (i) => {
    const isTop = i >= 12;
    const col = isTop ? i - 12 : 11 - i;
    const xBase = 110 + col * 80;
    const x = col >= 6 ? xBase + 60 : xBase;
    return { x, yBase: isTop ? 50 : 750, yTip: isTop ? 380 : 420, isTop };
  };

  const drawChecker = (ctx, x, y, color, isSelected = false) => {
    const colors = color === 'white' ? THEME.whiteChecker : THEME.redChecker;
    const grad = ctx.createRadialGradient(x - 8, y - 8, 2, x, y, 22);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = THEME.gold;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
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
      ctx.fillStyle = (i % 2 === 0 ? THEME.pointDark : THEME.pointLight);
      ctx.beginPath();
      ctx.moveTo(x - 36, yBase); ctx.lineTo(x + 36, yBase); ctx.lineTo(x, yTip);
      ctx.fill();

      state.points[i].checkers.forEach((col, j) => {
        const y = isTop ? 95 + (j * 44) : 705 - (j * 44);
        const isThisSelected = selectedPoint === i && j === state.points[i].checkers.length - 1;
        drawChecker(ctx, x, y, col, isThisSelected);
      });
    }

    // Barra central
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_WIDTH/2 - 30, 50, 60, CANVAS_HEIGHT - 100);
    ['white', 'red'].forEach((col, idx) => {
      for(let i=0; i<state.bar[col]; i++) {
        const y = idx === 0 ? 250 - (i*42) : 550 + (i*42);
        drawChecker(ctx, CANVAS_WIDTH/2, y, col, selectedPoint === 'bar' && col === state.turn);
      }
    });

    // Dados
    state.dice.forEach((d, i) => {
      const dx = CANVAS_WIDTH/2 - 130 + (i * 180), dy = CANVAS_HEIGHT/2 - 45;
      ctx.fillStyle = '#fff'; ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(dx, dy, 90, 90, 15) : ctx.fillRect(dx, dy, 90, 90);
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#000'; ctx.font = '900 48px Inter'; ctx.textAlign = 'center';
      ctx.fillText(d.toString(), dx + 45, dy + 62);
    });

    if (handCoords) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.beginPath(); ctx.arc(handCoords.x, handCoords.y, 12, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    }
  }, [state, selectedPoint, boardOpacity, handCoords]);

  useEffect(() => {
    const anim = requestAnimationFrame(render);
    return () => cancelAnimationFrame(anim);
  }, [render]);

  // --- IA ---
  useEffect(() => {
    if (state.turn === 'red' && state.gameMode === 'AI' && !state.winner) {
      setTimeout(() => {
        const ns = JSON.parse(JSON.stringify(state));
        if (ns.dice.length === 0) {
          const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
          ns.dice = [d1, d2]; ns.movesLeft = d1 === d2 ? [d1,d1,d1,d1] : [d1,d2];
          setState(ns); return;
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
        if (!moved) { ns.turn = 'white'; ns.dice = []; ns.movesLeft = []; setState(ns); }
      }, 1000);
    }
  }, [state.turn, state.dice, state.gameMode]);

  // --- CÁMARA Y HANDS ---
  useEffect(() => {
    if (view === 'PLAYING') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
        .catch(e => console.error(e));
    }
  }, [view]);

  // --- INTERACCIÓN ---
  const handleBoardClick = (e) => {
    if (state.turn !== state.userColor && state.gameMode === 'ONLINE') return;
    if (state.turn === 'red' && state.gameMode === 'AI') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    if (Math.abs(x - CANVAS_WIDTH/2) < 40) {
      if (state.bar[state.turn] > 0) setSelectedPoint('bar');
      return;
    }

    let clicked = -1;
    for (let i = 0; i < 24; i++) {
      const p = getPointCoords(i);
      if (Math.abs(x - p.x) < 40 && ((p.isTop && y < 400) || (!p.isTop && y > 400))) {
        clicked = i; break;
      }
    }

    if (clicked !== -1) {
      if (selectedPoint !== null) {
        const die = state.movesLeft.find(d => {
          const target = selectedPoint === 'bar' 
            ? (state.turn === 'red' ? d - 1 : 24 - d)
            : (state.turn === 'red' ? selectedPoint + d : selectedPoint - d);
          return target === clicked;
        });
        if (die) executeMove(selectedPoint, clicked, die);
        else if (state.points[clicked].checkers.includes(state.turn)) setSelectedPoint(clicked);
      } else if (state.points[clicked].checkers.includes(state.turn)) {
        setSelectedPoint(clicked);
      }
    }
  };

  const executeMove = (from, to, die, isAI = false) => {
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      const p = ns.turn;
      if (from === 'bar') ns.bar[p]--; else ns.points[from].checkers.pop();
      const dest = ns.points[to];
      if (dest.checkers.length === 1 && dest.checkers[0] !== p) {
        ns.bar[dest.checkers[0]]++; dest.checkers = [p];
      } else dest.checkers.push(p);
      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; }
      return ns;
    });
    if (!isAI) setSelectedPoint(null);
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform scaleX(-1)" style={{ opacity: camOpacity }} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onClick={handleBoardClick} className="absolute inset-0 w-full h-full z-10" />
      
      {/* CAPA UI */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        
        {/* HEADER */}
        {view === 'PLAYING' && (
          <header className="h-24 flex items-center justify-between px-10 pointer-events-auto">
            <button onClick={() => setIsMenuOpen(true)} className="w-12 h-12 flex flex-col justify-center gap-1.5 active:scale-90 transition-all">
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
              <div className="w-8 h-1 bg-white rounded-full"></div>
            </button>
            <div className={`px-10 py-3 rounded-full font-black text-xs uppercase tracking-widest ${state.turn === state.userColor ? 'bg-amber-500 text-black border-2 border-amber-400' : 'bg-white/10 text-white/40'}`}>
              {state.turn === state.userColor ? 'TU TURNO' : 'TURNO RIVAL'}
            </div>
            <button 
              onClick={() => {
                const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
                setState(s => ({...s, dice: [d1,d2], movesLeft: d1===d2 ? [d1,d1,d1,d1] : [d1,d2]}));
              }}
              disabled={state.movesLeft.length > 0 || (state.gameMode === 'AI' && state.turn === 'red')}
              className="px-10 py-3 bg-white text-black font-black rounded-full text-xs uppercase shadow-2xl disabled:opacity-20 active:scale-95 transition-all"
            >
              LANZAR
            </button>
          </header>
        )}

        {/* MENU LATERAL OPCIONES */}
        <div className={`side-menu absolute left-0 top-0 bottom-0 w-[320px] bg-black/95 border-r border-white/10 p-10 transform transition-transform duration-500 pointer-events-auto ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex justify-between items-center mb-16">
            <h2 className="text-4xl font-black italic tracking-tighter">OPCIONES</h2>
            <button onClick={() => setIsMenuOpen(false)} className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center font-bold text-xl">✕</button>
          </div>
          <div className="space-y-12 flex-1">
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-black uppercase text-white/40 tracking-widest">Tablero <span className="text-white">{Math.round(boardOpacity*100)}%</span></div>
              <input type="range" min="0" max="1" step="0.05" value={boardOpacity} onChange={e => setBoardOpacity(parseFloat(e.target.value))} className="w-full accent-amber-500" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-black uppercase text-white/40 tracking-widest">Cámara <span className="text-white">{Math.round(camOpacity*100)}%</span></div>
              <input type="range" min="0" max="1" step="0.05" value={camOpacity} onChange={e => setCamOpacity(parseFloat(e.target.value))} className="w-full accent-amber-500" />
            </div>
            <button className="w-full py-4 rounded-xl border border-white/10 font-black uppercase text-xs text-white/60">Rotar Tablero</button>
            <button onClick={() => { setState(getInitialState()); setIsMenuOpen(false); }} className="w-full py-4 rounded-xl bg-amber-500/10 border border-amber-500/20 font-black uppercase text-xs text-amber-500">Reiniciar</button>
          </div>
          <button onClick={() => window.location.reload()} className="w-full py-4 rounded-xl border border-white/10 font-black uppercase text-xs text-white/40">Salir</button>
        </div>

        {/* HOME MENU (FOTO 1) */}
        {view === 'HOME' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-8 bg-black z-50 p-6 pointer-events-auto">
            <h1 className="text-[140px] font-black italic tracking-tighter uppercase leading-[0.8] mb-20">B-GAMMON AR</h1>
            <button onClick={() => { setState(s => ({...s, gameMode: 'AI'})); setView('PLAYING'); }} className="w-[450px] py-9 bg-white text-black font-black rounded-3xl uppercase text-2xl shadow-2xl active:scale-95 transition-all">VS MÁQUINA</button>
            <button onClick={() => setView('LOBBY')} className="w-[450px] py-9 bg-zinc-800 text-white font-black rounded-3xl uppercase text-2xl active:scale-95 transition-all">MULTIJUGADOR</button>
            <button onClick={() => { setState(getInitialState()); setView('PLAYING'); }} className="w-[450px] py-7 bg-zinc-900 text-white/30 font-black rounded-3xl uppercase text-sm active:scale-95 transition-all">LOCAL (2 PLAYERS)</button>
          </div>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
