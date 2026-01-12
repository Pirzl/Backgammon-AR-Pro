
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- CONSTANTES ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const COLORS = { 
  white: '#FFFFFF', 
  red: '#FF3B30', 
  gold: '#FFCC00',
  board: 'rgba(20, 20, 20, 0.85)',
  point1: '#333333',
  point2: '#444444'
};

type Player = 'white' | 'red';
type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

interface Point { checkers: Player[]; }
interface GameState {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  turn: Player;
  dice: number[];
  movesLeft: number[];
  winner: Player | null;
  gameMode: GameMode;
  userColor: Player;
  roomID: string;
}

const getInitialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => { for(let i=0; i<n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return p;
};

const App: React.FC = () => {
  const [view, setView] = useState<'HOME' | 'LOBBY' | 'INVITE' | 'PLAYING' | 'CONNECTING'>('HOME');
  const [state, setState] = useState<GameState>({
    points: getInitialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null, gameMode: 'LOCAL',
    userColor: 'white', roomID: ''
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);

  // --- RENDERIZADO DEL TABLERO ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dibujar fondo del tablero
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(50, 50, CANVAS_WIDTH - 100, CANVAS_HEIGHT - 100);
    
    // Dibujar barra central
    ctx.fillStyle = '#111';
    ctx.fillRect(CANVAS_WIDTH/2 - 30, 50, 60, CANVAS_HEIGHT - 100);

    // Dibujar triángulos (puntos)
    for (let i = 0; i < 24; i++) {
      const isTop = i < 12;
      const x = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
      const adjX = (i < 6 || i > 17) ? x : (isTop ? x - 60 : x + 60); // Ajuste por la barra
      
      ctx.fillStyle = i % 2 === 0 ? COLORS.point1 : COLORS.point2;
      if (selectedPoint === i) ctx.fillStyle = COLORS.gold;

      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(adjX - 35, 50);
        ctx.lineTo(adjX + 35, 50);
        ctx.lineTo(adjX, 300);
      } else {
        ctx.moveTo(adjX - 35, CANVAS_HEIGHT - 50);
        ctx.lineTo(adjX + 35, CANVAS_HEIGHT - 50);
        ctx.lineTo(adjX, CANVAS_HEIGHT - 300);
      }
      ctx.fill();

      // Dibujar fichas
      const point = state.points[i];
      point.checkers.forEach((col, j) => {
        ctx.fillStyle = COLORS[col];
        ctx.beginPath();
        const y = isTop ? 80 + (j * 45) : CANVAS_HEIGHT - 80 - (j * 45);
        ctx.arc(adjX, y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Dibujar fichas en la barra
    ['white', 'red'].forEach((col, idx) => {
        const count = state.bar[col as Player];
        for(let i=0; i<count; i++) {
            ctx.fillStyle = COLORS[col as Player];
            ctx.beginPath();
            ctx.arc(CANVAS_WIDTH/2, idx === 0 ? 300 - (i*30) : 500 + (i*30), 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    });

    // Dibujar Dados
    if (state.dice.length > 0) {
        state.dice.forEach((d, i) => {
            ctx.fillStyle = 'white';
            const dx = CANVAS_WIDTH / 2 + 100 + (i * 70);
            const dy = CANVAS_HEIGHT / 2 - 30;
            ctx.roundRect ? ctx.roundRect(dx, dy, 60, 60, 10) : ctx.fillRect(dx, dy, 60, 60);
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.font = 'bold 30px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(d.toString(), dx + 30, dy + 42);
        });
    }
  }, [state, selectedPoint]);

  useEffect(() => {
    const anim = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(anim);
  }, [draw]);

  // --- LÓGICA DE JUEGO ---
  const canMove = (from: number | 'bar', to: number | 'off', die: number, gs: GameState): boolean => {
    const p = gs.turn;
    if (!gs.movesLeft.includes(die)) return false;
    if (gs.bar[p] > 0 && from !== 'bar') return false;

    if (to === 'off') {
        const homeRange = p === 'red' ? [18, 23] : [0, 5];
        // Check both points and bar to ensure all checkers are in home range
        const allInHome = gs.bar[p] === 0 && gs.points.every((pt, i) => !pt.checkers.includes(p) || (i >= homeRange[0] && i <= homeRange[1]));
        if (!allInHome) return false;
        
        // Fix for Error in file index.tsx on line 151: 
        // Cast 'from' to number to avoid "The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type" error
        const fromPos = typeof from === 'number' ? from : -1;
        if (fromPos === -1) return false;

        const dist = p === 'red' ? 24 - fromPos : fromPos + 1;
        return die >= dist;
    }

    const target = gs.points[to as number];
    if (target.checkers.length > 1 && target.checkers[0] !== p) return false;
    return true;
  };

  const handleMove = (from: number | 'bar', to: number | 'off', die: number) => {
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev)) as GameState;
      const p = ns.turn;
      
      // Fix: cast from to number when indexing ns.points
      if (from === 'bar') ns.bar[p]--; else ns.points[from as number].checkers.pop();

      if (to === 'off') ns.off[p]++;
      else {
        const dest = ns.points[to as number];
        if (dest.checkers.length === 1 && dest.checkers[0] !== p) {
          ns.bar[dest.checkers[0]]++;
          dest.checkers = [p];
        } else {
          dest.checkers.push(p);
        }
      }

      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.off[p] === 15) ns.winner = p;
      if (!ns.winner && ns.movesLeft.length === 0) {
        ns.turn = ns.turn === 'white' ? 'red' : 'white';
        ns.dice = [];
      }

      if (ns.gameMode === 'ONLINE' && connRef.current?.open) {
        connRef.current.send({ type: 'STATE_UPDATE', payload: ns });
      }
      return ns;
    });
    setSelectedPoint(null);
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (state.turn !== state.userColor && state.gameMode !== 'LOCAL') return;
    if (state.movesLeft.length === 0) return;

    // Lógica simplificada de detección de puntos por coordenadas
    // En una implementación AR real esto usaría Raycasting, aquí usamos hitboxes de los triángulos
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    // Detectar si pulsamos la barra
    if (Math.abs(x - CANVAS_WIDTH/2) < 40) {
        if (state.bar[state.turn] > 0) setSelectedPoint('bar');
        return;
    }

    // Detectar punto (triángulo)
    let clickedPoint = -1;
    for (let i = 0; i < 24; i++) {
        const isTop = i < 12;
        const px = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
        const adjX = (i < 6 || i > 17) ? px : (isTop ? px - 60 : px + 60);
        if (Math.abs(x - adjX) < 40) {
            clickedPoint = i;
            break;
        }
    }

    if (clickedPoint !== -1) {
        if (selectedPoint !== null) {
            // Intentar mover de selectedPoint a clickedPoint
            const die = state.movesLeft.find(d => {
                const target = selectedPoint === 'bar' 
                    ? (state.turn === 'red' ? d - 1 : 24 - d)
                    : (state.turn === 'red' ? (selectedPoint as number) + d : (selectedPoint as number) - d);
                return target === clickedPoint && canMove(selectedPoint, clickedPoint, d, state);
            });
            if (die) handleMove(selectedPoint, clickedPoint, die);
            else setSelectedPoint(clickedPoint);
        } else {
            if (state.points[clickedPoint].checkers.includes(state.turn)) {
                setSelectedPoint(clickedPoint);
            }
        }
    }
  };

  const rollDice = () => {
    if (state.movesLeft.length > 0) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    setState(s => ({ ...s, dice: [d1, d2], movesLeft: moves }));
  };

  // --- IA ---
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn === 'red' && !state.winner) {
      const timer = setTimeout(() => {
        if (state.movesLeft.length === 0) rollDice();
        else {
          const die = state.movesLeft[0];
          // Estrategia básica: mover primera ficha legal
          let moved = false;
          if (state.bar.red > 0) {
              const to = die - 1;
              if (canMove('bar', to, die, state)) { handleMove('bar', to, die); moved = true; }
          } else {
              for(let i=0; i<24; i++) {
                  if (state.points[i].checkers.includes('red')) {
                      const to = i + die;
                      if (to < 24 && canMove(i, to, die, state)) { handleMove(i, to, die); moved = true; break; }
                  }
              }
          }
          if (!moved) setState(s => ({...s, turn: 'white', dice: [], movesLeft: []}));
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.turn, state.movesLeft]);

  // --- P2P ---
  const initP2P = (rid: string, isHost: boolean) => {
    const id = isHost ? `bg-${rid}` : `bg-${rid}-client-${Math.random().toString(36).substr(2,5)}`;
    const peer = new (window as any).Peer(id);
    peerRef.current = peer;
    peer.on('open', () => {
        if (!isHost) {
            const conn = peer.connect(`bg-${rid}`);
            connRef.current = conn;
            conn.on('data', (d: any) => d.type === 'STATE' && setState(s => ({...s, ...d.payload, userColor: s.userColor})));
            setView('PLAYING');
        } else {
            peer.on('connection', (c: any) => {
                connRef.current = c;
                c.on('open', () => c.send({type: 'STATE', payload: state}));
                c.on('data', (d: any) => d.type === 'STATE' && setState(s => ({...s, ...d.payload, userColor: s.userColor})));
                setView('PLAYING');
            });
        }
    });
  };

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) {
        setState(s => ({...s, roomID: room, isHost: false, userColor: 'red', gameMode: 'ONLINE'}));
        initP2P(room, false);
    }
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-black overflow-hidden select-none">
      {view === 'HOME' && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <h1 className="text-8xl font-black italic tracking-tighter shadow-glow mb-8">B-GAMMON</h1>
          <button onClick={() => { setState(s => ({...s, gameMode: 'AI'})); setView('PLAYING'); }} className="w-64 py-5 bg-white text-black font-black rounded-2xl uppercase shadow-xl hover:scale-105 transition-transform">Vs Máquina</button>
          <button onClick={() => setView('LOBBY')} className="w-64 py-5 bg-stone-800 text-white font-black rounded-2xl uppercase hover:bg-stone-700">Online</button>
          <button onClick={() => { setState(s => ({...s, gameMode: 'LOCAL'})); setView('PLAYING'); }} className="w-64 py-4 bg-stone-900 text-white/40 font-bold rounded-xl uppercase text-xs">Local (2 Jugadores)</button>
        </div>
      )}

      {view === 'LOBBY' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-4xl font-black italic mb-8">NUEVA PARTIDA</h2>
            <button onClick={() => {
                const rid = Math.random().toString(36).substr(2, 6).toUpperCase();
                setState(s => ({...s, roomID: rid, gameMode: 'ONLINE', isHost: true}));
                initP2P(rid, true);
                setView('INVITE');
            }} className="bg-yellow-500 text-black font-black px-12 py-5 rounded-2xl uppercase">Crear Sala</button>
            <button onClick={() => setView('HOME')} className="mt-8 text-white/40 text-xs font-bold uppercase">Volver</button>
        </div>
      )}

      {view === 'INVITE' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-2xl font-black italic mb-4">SALA: {state.roomID}</h2>
            <p className="text-white/50 text-xs mb-8">Comparte este link con tu rival:</p>
            <div className="bg-white/5 p-4 rounded-xl font-mono text-yellow-500 mb-6 break-all max-w-xs text-[10px]">
                {window.location.origin}/?room={state.roomID}
            </div>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomID}`)} className="bg-white text-black font-black px-8 py-3 rounded-lg text-sm uppercase">Copiar Link</button>
            <p className="mt-12 text-[10px] uppercase font-bold animate-pulse text-white/20">Esperando oponente...</p>
        </div>
      )}

      {view === 'PLAYING' && (
        <div className="flex-1 flex flex-col relative">
          <header className="h-16 bg-black/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 z-50">
            <div className="text-white/40 font-black text-[10px] uppercase cursor-pointer" onClick={() => window.location.reload()}>Salir</div>
            <div className={`px-4 py-1.5 rounded-full font-black text-[11px] uppercase border ${state.turn === state.userColor ? 'bg-yellow-500 text-black' : 'border-white/20 text-white/40'}`}>
                {state.turn === 'white' ? 'Blancas' : 'Rojas'} {state.gameMode === 'ONLINE' && (state.turn === state.userColor ? '(TÚ)' : '(RIVAL)')}
            </div>
            <button onClick={rollDice} disabled={state.movesLeft.length > 0 || (state.gameMode === 'ONLINE' && state.turn !== state.userColor)} className="bg-white text-black font-black px-5 py-1.5 rounded-full text-[10px] uppercase disabled:opacity-20">Lanzar</button>
          </header>

          <main className="flex-1 relative cursor-crosshair" onClick={onCanvasClick}>
            <video ref={videoRef} className="absolute inset-0 w-full h-full opacity-40" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 w-full h-full pointer-events-none" />
            
            {state.winner && (
                <div className="absolute inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center animate-in fade-in">
                    <h2 className="text-7xl font-black italic mb-8">¡VICTORIA {state.winner === 'white' ? 'BLANCA' : 'ROJA'}!</h2>
                    <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-12 py-4 rounded-xl uppercase">Cerrar</button>
                </div>
            )}
          </main>

          <footer className="h-20 bg-stone-900 flex items-center justify-center gap-4 px-6 border-t border-white/5">
            <div className="flex-1 flex justify-start items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white"></div>
                <span className="text-[10px] font-bold">{state.off.white}/15</span>
            </div>
            <div className="flex gap-2">
                {state.movesLeft.map((m, i) => <div key={i} className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center text-black font-black text-xs">{m}</div>)}
                {state.movesLeft.length === 0 && <span className="text-white/20 text-[10px] uppercase font-bold">Lanza los dados</span>}
            </div>
            <div className="flex-1 flex justify-end items-center gap-2">
                <span className="text-[10px] font-bold">{state.off.red}/15</span>
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
