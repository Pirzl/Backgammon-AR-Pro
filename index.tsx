
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- CONSTANTES ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const COLORS = { 
  white: '#FFFFFF', 
  red: '#FF3B30', 
  gold: '#FFCC00',
  board: 'rgba(20, 20, 20, 0.7)',
  point1: '#2a2a2a',
  point2: '#3a3a3a'
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
  isHost: boolean;
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
    userColor: 'white', roomID: '', isHost: true
  });
  
  const [camOpacity, setCamOpacity] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  // --- CÁMARA ---
  useEffect(() => {
    if (view === 'PLAYING') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(err => console.error("Error cámara:", err));
    }
  }, [view]);

  // --- RENDERIZADO ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(50, 50, CANVAS_WIDTH - 100, CANVAS_HEIGHT - 100);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_WIDTH/2 - 25, 50, 50, CANVAS_HEIGHT - 100);

    for (let i = 0; i < 24; i++) {
      const isTop = i < 12;
      const x = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
      const adjX = (i < 6 || i > 17) ? x : (isTop ? x - 50 : x + 50);
      
      ctx.fillStyle = selectedPoint === i ? COLORS.gold : (i % 2 === 0 ? COLORS.point1 : COLORS.point2);
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(adjX - 35, 50); ctx.lineTo(adjX + 35, 50); ctx.lineTo(adjX, 320);
      } else {
        ctx.moveTo(adjX - 35, CANVAS_HEIGHT - 50); ctx.lineTo(adjX + 35, CANVAS_HEIGHT - 50); ctx.lineTo(adjX, CANVAS_HEIGHT - 320);
      }
      ctx.fill();

      state.points[i].checkers.forEach((col, j) => {
        ctx.fillStyle = COLORS[col];
        ctx.beginPath();
        const y = isTop ? 80 + (j * 42) : CANVAS_HEIGHT - 80 - (j * 42);
        ctx.arc(adjX, y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Barra y Dados
    ['white', 'red'].forEach((col, idx) => {
      for(let i=0; i<state.bar[col as Player]; i++) {
        ctx.fillStyle = COLORS[col as Player];
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH/2, idx === 0 ? 300 - (i*30) : 500 + (i*30), 22, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    });

    if (state.dice.length > 0) {
      state.dice.forEach((d, i) => {
        const dx = CANVAS_WIDTH/2 + 100 + (i*80), dy = CANVAS_HEIGHT/2 - 35;
        ctx.fillStyle = 'white'; ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(dx, dy, 70, 70, 12) : ctx.fillRect(dx, dy, 70, 70);
        ctx.fill(); ctx.fillStyle = 'black'; ctx.font = 'bold 36px Inter'; ctx.textAlign = 'center';
        ctx.fillText(d.toString(), dx + 35, dy + 48);
      });
    }
  }, [state, selectedPoint]);

  useEffect(() => {
    const anim = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(anim);
  }, [draw]);

  // --- LÓGICA ---
  const canMove = (from: number | 'bar', to: number | 'off', die: number, gs: GameState): boolean => {
    const p = gs.turn;
    if (!gs.movesLeft.includes(die)) return false;
    if (gs.bar[p] > 0 && from !== 'bar') return false;
    if (to === 'off') {
      const home = p === 'red' ? [18, 23] : [0, 5];
      if (gs.bar[p] > 0 || !gs.points.every((pt, i) => !pt.checkers.includes(p) || (i >= home[0] && i <= home[1]))) return false;
      const dist = p === 'red' ? 24 - (from as number) : (from as number) + 1;
      return die >= dist;
    }
    const target = gs.points[to as number];
    return !(target.checkers.length > 1 && target.checkers[0] !== p);
  };

  const handleMove = (from: number | 'bar', to: number | 'off', die: number) => {
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev)) as GameState;
      const p = ns.turn;
      if (from === 'bar') ns.bar[p]--; else ns.points[from as number].checkers.pop();
      if (to === 'off') ns.off[p]++;
      else {
        const dest = ns.points[to as number];
        if (dest.checkers.length === 1 && dest.checkers[0] !== p) { ns.bar[dest.checkers[0]]++; dest.checkers = [p]; }
        else dest.checkers.push(p);
      }
      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.off[p] === 15) ns.winner = p;
      if (!ns.winner && ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; }
      if (ns.gameMode === 'ONLINE' && connRef.current?.open) connRef.current.send({ type: 'STATE', payload: ns });
      return ns;
    });
    setSelectedPoint(null);
  };

  const rollDice = () => {
    if (state.movesLeft.length > 0) return;
    const d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    setState(s => {
      const ns = { ...s, dice: [d1, d2], movesLeft: moves };
      if (ns.gameMode === 'ONLINE' && connRef.current?.open) connRef.current.send({ type: 'STATE', payload: ns });
      return ns;
    });
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (state.turn !== state.userColor && state.gameMode !== 'LOCAL') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width), y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    
    if (Math.abs(x - CANVAS_WIDTH/2) < 40) { if (state.bar[state.turn] > 0) setSelectedPoint('bar'); return; }

    let cp = -1;
    for (let i = 0; i < 24; i++) {
      const isTop = i < 12;
      const px = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
      const adjX = (i < 6 || i > 17) ? px : (isTop ? px - 50 : px + 50);
      if (Math.abs(x - adjX) < 40 && ((isTop && y < 400) || (!isTop && y > 400))) { cp = i; break; }
    }

    if (cp !== -1) {
      if (selectedPoint !== null) {
        const die = state.movesLeft.find(d => {
          const target = selectedPoint === 'bar' ? (state.turn === 'red' ? d - 1 : 24 - d) : (state.turn === 'red' ? (selectedPoint as number) + d : (selectedPoint as number) - d);
          return target === cp && canMove(selectedPoint, cp, d, state);
        });
        if (die) handleMove(selectedPoint, cp, die); else setSelectedPoint(cp);
      } else if (state.points[cp].checkers.includes(state.turn)) setSelectedPoint(cp);
    }
  };

  // --- IA ---
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn === 'red' && !state.winner) {
      const timer = setTimeout(() => {
        if (state.movesLeft.length === 0) rollDice();
        else {
          const die = state.movesLeft[0]; let moved = false;
          if (state.bar.red > 0) { if (canMove('bar', die-1, die, state)) { handleMove('bar', die-1, die); moved = true; } }
          else {
            for(let i=0; i<24; i++) if (state.points[i].checkers.includes('red')) {
              if (i+die < 24 && canMove(i, i+die, die, state)) { handleMove(i, i+die, die); moved = true; break; }
            }
          }
          if (!moved) setState(s => ({...s, turn: 'white', dice: [], movesLeft: []}));
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [state.turn, state.movesLeft]);

  // --- P2P ---
  const initP2P = (rid: string, isHost: boolean) => {
    const peer = new (window as any).Peer(isHost ? `bgammon-${rid}` : undefined);
    peerRef.current = peer;
    peer.on('open', (id: string) => {
      if (!isHost) {
        const conn = peer.connect(`bgammon-${rid}`);
        connRef.current = conn;
        conn.on('open', () => { setView('PLAYING'); conn.send({ type: 'REQ_SYNC' }); });
        conn.on('data', (d: any) => d.type === 'STATE' && setState(s => ({...s, ...d.payload, userColor: s.userColor})));
      } else {
        peer.on('connection', (c: any) => {
          connRef.current = c;
          c.on('data', (d: any) => {
            if (d.type === 'REQ_SYNC') c.send({ type: 'STATE', payload: state });
            if (d.type === 'STATE') setState(s => ({...s, ...d.payload, userColor: s.userColor}));
          });
          setView('PLAYING');
        });
      }
    });
  };

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room && view === 'HOME') {
      setState(s => ({...s, roomID: room, isHost: false, userColor: 'red', gameMode: 'ONLINE'}));
      initP2P(room, false);
      setView('CONNECTING');
    }
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-black overflow-hidden select-none">
      {view === 'HOME' && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <h1 className="text-8xl font-black italic tracking-tighter shadow-glow mb-8 animate-pulse">B-GAMMON</h1>
          <button onClick={() => { setState(s => ({...s, gameMode: 'AI'})); setView('PLAYING'); }} className="w-72 py-6 bg-white text-black font-black rounded-3xl uppercase shadow-2xl hover:scale-105 transition-all">Vs Máquina</button>
          <button onClick={() => setView('LOBBY')} className="w-72 py-6 bg-stone-800 text-white font-black rounded-3xl uppercase hover:bg-stone-700">Online</button>
          <button onClick={() => { setState(s => ({...s, gameMode: 'LOCAL'})); setView('PLAYING'); }} className="text-white/20 font-bold uppercase text-[10px] tracking-widest hover:text-white">Local (2 Players)</button>
        </div>
      )}

      {view === 'LOBBY' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8">
            <h2 className="text-5xl font-black italic">MULTIJUGADOR</h2>
            <button onClick={() => {
                const rid = Math.random().toString(36).substr(2, 6).toUpperCase();
                setState(s => ({...s, roomID: rid, gameMode: 'ONLINE', isHost: true}));
                initP2P(rid, true);
                setView('INVITE');
            }} className="bg-yellow-500 text-black font-black px-16 py-6 rounded-3xl uppercase shadow-glow">Crear Nueva Sala</button>
            <button onClick={() => setView('HOME')} className="text-white/40 font-bold uppercase text-xs">Atrás</button>
        </div>
      )}

      {view === 'INVITE' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center glass">
            <h2 className="text-3xl font-black italic mb-4">SALA: {state.roomID}</h2>
            <div className="bg-white/5 p-6 rounded-3xl font-mono text-yellow-500 mb-8 break-all max-w-sm text-xs border border-white/10">
                {window.location.origin}/?room={state.roomID}
            </div>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomID}`)} className="bg-white text-black font-black px-12 py-4 rounded-2xl text-sm uppercase">Copiar Enlace</button>
            <p className="mt-12 text-[10px] uppercase font-bold animate-pulse text-white/30">Esperando oponente...</p>
        </div>
      )}

      {view === 'PLAYING' && (
        <div className="flex-1 flex flex-col relative">
          <header className="h-16 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-[60]">
            <div className="text-white/40 font-black text-[10px] uppercase tracking-widest cursor-pointer" onClick={() => window.location.reload()}>Salir</div>
            <div className={`px-6 py-2 rounded-full font-black text-[11px] uppercase border shadow-lg transition-all ${state.turn === state.userColor ? 'bg-yellow-500 text-black border-yellow-500' : 'border-white/20 text-white/40'}`}>
                {state.turn === 'white' ? 'Blancas' : 'Rojas'} {state.gameMode === 'ONLINE' && (state.turn === state.userColor ? '(TÚ)' : '(RIVAL)')}
            </div>
            <div className="flex gap-2">
                <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 flex items-center justify-center bg-stone-800 rounded-full">⚙️</button>
                <button onClick={rollDice} disabled={state.movesLeft.length > 0 || (state.gameMode === 'ONLINE' && state.turn !== state.userColor)} className="bg-white text-black font-black px-6 py-2 rounded-full text-[10px] uppercase disabled:opacity-20 active:scale-90 transition-transform">Lanzar</button>
            </div>
          </header>

          <main className="flex-1 relative cursor-crosshair overflow-hidden" onClick={onCanvasClick}>
            <video ref={videoRef} className="absolute inset-0" autoPlay playsInline muted style={{ opacity: camOpacity }} />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 pointer-events-none" />
            
            {showSettings && (
                <div className="absolute top-4 right-4 z-[70] p-6 glass rounded-3xl border border-white/10 w-64 space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest mb-4">Ajustes AR</h3>
                    <label className="text-[9px] uppercase font-bold text-white/40">Opacidad Cámara</label>
                    <input type="range" min="0" max="1" step="0.1" value={camOpacity} onChange={(e) => setCamOpacity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                    <button onClick={() => setShowSettings(false)} className="w-full py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase">Cerrar</button>
                </div>
            )}

            {state.winner && (
                <div className="absolute inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                    <h2 className="text-8xl font-black italic mb-8 tracking-tighter">¡VICTORIA!</h2>
                    <p className="text-yellow-500 font-black uppercase mb-12 tracking-widest">El jugador {state.winner === 'white' ? 'Blanco' : 'Rojo'} domina el tablero</p>
                    <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-16 py-6 rounded-3xl uppercase text-sm hover:bg-yellow-500 transition-colors">Volver al Inicio</button>
                </div>
            )}
          </main>

          <footer className="h-20 bg-stone-900/90 backdrop-blur-xl flex items-center justify-between px-10 border-t border-white/10 z-[60]">
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-white shadow-glow"></div>
                <span className="text-sm font-black italic">{state.off.white}/15</span>
            </div>
            <div className="flex gap-3">
                {state.movesLeft.map((m, i) => <div key={i} className="w-10 h-10 bg-yellow-500 rounded-xl flex items-center justify-center text-black font-black text-sm shadow-glow animate-bounce">{m}</div>)}
                {state.movesLeft.length === 0 && <span className="text-white/20 text-[10px] uppercase font-black tracking-widest animate-pulse">Dados pendientes...</span>}
            </div>
            <div className="flex items-center gap-3">
                <span className="text-sm font-black italic">{state.off.red}/15</span>
                <div className="w-4 h-4 rounded-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
