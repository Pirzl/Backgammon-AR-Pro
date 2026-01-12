
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const COLORS = {
  white: '#FFFFFF',
  red: '#FF3B30',
  gold: '#FFCC00',
  board: 'rgba(15, 15, 15, 0.8)',
  point1: '#222222',
  point2: '#333333'
};

type Player = 'white' | 'red';
type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

interface GameState {
  points: { checkers: Player[] }[];
  bar: { white: number; red: number };
  off: { white: number; red: number };
  turn: Player;
  dice: number[];
  movesLeft: number[];
  winner: Player | null;
  gameMode: GameMode;
  userColor: Player;
  roomID: string;
}

const getInitialState = (): GameState => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => { for (let i = 0; i < n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return {
    points: p, bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null,
    gameMode: 'LOCAL', userColor: 'white', roomID: ''
  };
};

const App: React.FC = () => {
  const [view, setView] = useState<'HOME' | 'LOBBY' | 'INVITE' | 'PLAYING'>('HOME');
  const [state, setState] = useState<GameState>(getInitialState());
  const [camOpacity, setCamOpacity] = useState(0.6);
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
        .catch(err => console.error("Fallo Cámara:", err));
    }
  }, [view]);

  // --- RENDERIZADO ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Dibujar Tablero
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(50, 50, CANVAS_WIDTH - 100, CANVAS_HEIGHT - 100);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_WIDTH/2 - 25, 50, 50, CANVAS_HEIGHT - 100);

    for (let i = 0; i < 24; i++) {
      const isTop = i < 12;
      const x = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
      const adjX = (i < 6 || i > 17) ? x : (isTop ? x - 50 : x + 50);
      
      ctx.fillStyle = selectedPoint === i ? COLORS.gold : (i % 2 === 0 ? COLORS.point1 : COLORS.point2);
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(adjX - 35, 50); ctx.lineTo(adjX + 35, 50); ctx.lineTo(adjX, 330);
      } else {
        ctx.moveTo(adjX - 35, CANVAS_HEIGHT - 50); ctx.lineTo(adjX + 35, CANVAS_HEIGHT - 50); ctx.lineTo(adjX, CANVAS_HEIGHT - 330);
      }
      ctx.fill();

      state.points[i].checkers.forEach((col, j) => {
        ctx.fillStyle = COLORS[col];
        ctx.beginPath();
        const y = isTop ? 85 + (j * 42) : CANVAS_HEIGHT - 85 - (j * 42);
        ctx.arc(adjX, y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Dibujar Barra
    ['white', 'red'].forEach((col, idx) => {
      const count = state.bar[col as Player];
      for(let i=0; i<count; i++){
        ctx.fillStyle = COLORS[col as Player];
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH/2, idx === 0 ? 250 - (i*35) : 550 + (i*35), 22, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    });

    // Dibujar Dados
    state.dice.forEach((d, i) => {
      const dx = CANVAS_WIDTH/2 + 120 + (i * 90), dy = CANVAS_HEIGHT/2 - 35;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(dx, dy, 70, 70, 15) : ctx.fillRect(dx, dy, 70, 70);
      ctx.fill();
      ctx.fillStyle = 'black';
      ctx.font = 'bold 32px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(d.toString(), dx + 35, dy + 45);
    });

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
      const allInHome = gs.bar[p] === 0 && gs.points.every((pt, i) => !pt.checkers.includes(p) || (i >= homeRange[0] && i <= homeRange[1]));
      if (!allInHome) return false;
      const dist = p === 'red' ? 24 - (from as number) : (from as number) + 1;
      return die >= dist;
    }

    const target = gs.points[to as number];
    if (target.checkers.length > 1 && target.checkers[0] !== p) return false;
    return true;
  };

  const syncState = (ns: GameState) => {
    if (ns.gameMode === 'ONLINE' && connRef.current?.open) {
      connRef.current.send({ type: 'STATE', payload: ns });
    }
    setState(ns);
  };

  const handleMove = (from: number | 'bar', to: number | 'off', die: number) => {
    const ns = JSON.parse(JSON.stringify(state)) as GameState;
    const p = ns.turn;
    
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

    syncState(ns);
    setSelectedPoint(null);
  };

  const rollDice = () => {
    if (state.movesLeft.length > 0) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    syncState({ ...state, dice: [d1, d2], movesLeft: moves });
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (state.turn !== state.userColor && state.gameMode !== 'LOCAL') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    if (Math.abs(x - CANVAS_WIDTH/2) < 40) {
        if (state.bar[state.turn] > 0) setSelectedPoint('bar');
        return;
    }

    let clicked = -1;
    for (let i = 0; i < 24; i++) {
        const isTop = i < 12;
        const px = isTop ? CANVAS_WIDTH - 110 - (i * 80) : 110 + ((i - 12) * 80);
        const adjX = (i < 6 || i > 17) ? px : (isTop ? px - 50 : px + 50);
        if (Math.abs(x - adjX) < 40 && ((isTop && y < 400) || (!isTop && y > 400))) { clicked = i; break; }
    }

    if (clicked !== -1) {
        if (selectedPoint !== null) {
            const die = state.movesLeft.find(d => {
                const target = selectedPoint === 'bar' 
                    ? (state.turn === 'red' ? d - 1 : 24 - d)
                    : (state.turn === 'red' ? (selectedPoint as number) + d : (selectedPoint as number) - d);
                return target === clicked && canMove(selectedPoint, clicked, d, state);
            });
            if (die) handleMove(selectedPoint, clicked, die);
            else if (state.points[clicked].checkers.includes(state.turn)) setSelectedPoint(clicked);
        } else if (state.points[clicked].checkers.includes(state.turn)) {
            setSelectedPoint(clicked);
        }
    }
  };

  // --- P2P CORE ---
  const initP2P = (rid: string, isHost: boolean) => {
    const peer = new (window as any).Peer(`bgp-${rid}${isHost ? '-host' : '-guest' + Math.floor(Math.random()*1000)}`);
    peerRef.current = peer;

    peer.on('open', () => {
      if (!isHost) {
        const conn = peer.connect(`bgp-${rid}-host`);
        connRef.current = conn;
        conn.on('open', () => { 
          setView('PLAYING'); 
          conn.send({ type: 'REQ_SYNC' }); 
        });
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
    peer.on('error', (err: any) => console.error("Peer Error:", err));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && view === 'HOME') {
      setState(s => ({ ...s, roomID: room, userColor: 'red', gameMode: 'ONLINE' }));
      initP2P(room, false);
    }
  }, []);

  return (
    <div className="w-full h-full relative bg-black overflow-hidden select-none">
      <video ref={videoRef} autoPlay playsInline muted style={{ opacity: camOpacity }} />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      
      <div className="ui-layer">
        {view === 'HOME' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 bg-black">
            <h1 className="text-7xl font-black italic shadow-glow tracking-tighter mb-12">B-GAMMON AR</h1>
            <button onClick={() => { setState(s => ({...s, gameMode: 'LOCAL'})); setView('PLAYING'); }} className="w-72 py-6 bg-white text-black font-black rounded-3xl uppercase hover:scale-105 transition-all">Local (2 Players)</button>
            <button onClick={() => setView('LOBBY')} className="w-72 py-6 bg-stone-800 text-white font-black rounded-3xl uppercase hover:bg-stone-700 transition-all">Online PvP</button>
            <button onClick={() => { setState(s => ({...s, gameMode: 'AI'})); setView('PLAYING'); }} className="text-white/30 text-[10px] font-bold uppercase tracking-widest hover:text-white">vs CPU (Alpha)</button>
          </div>
        )}

        {view === 'LOBBY' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black">
             <h2 className="text-4xl font-black italic mb-8">NUEVA PARTIDA</h2>
             <button onClick={() => {
                const rid = Math.random().toString(36).substring(2, 7).toUpperCase();
                setState(s => ({ ...s, roomID: rid, gameMode: 'ONLINE', userColor: 'white' }));
                initP2P(rid, true);
                setView('INVITE');
             }} className="bg-yellow-500 text-black font-black px-16 py-6 rounded-3xl uppercase">Generar Sala</button>
             <button onClick={() => setView('HOME')} className="mt-8 text-white/40 text-xs font-bold">CANCELAR</button>
          </div>
        )}

        {view === 'INVITE' && (
           <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/80 backdrop-blur-xl">
              <h2 className="text-2xl font-black mb-4 tracking-widest uppercase">INVITAR RIVAL</h2>
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl text-yellow-500 font-mono text-xs break-all max-w-sm mb-8 text-center">
                {window.location.origin}/?room={state.roomID}
              </div>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?room=${state.roomID}`);
                alert("Enlace copiado. Envíalo a tu amigo.");
              }} className="bg-white text-black font-black px-12 py-4 rounded-2xl uppercase text-sm">Copiar Enlace</button>
              <p className="mt-12 text-[10px] uppercase font-bold animate-pulse text-white/30 tracking-widest">Esperando oponente...</p>
           </div>
        )}

        {view === 'PLAYING' && (
          <div className="flex-1 flex flex-col" onClick={onCanvasClick}>
            <header className="h-16 flex items-center justify-between px-6 bg-black/60 backdrop-blur-md border-b border-white/10">
              <div className="text-white/40 font-black text-[10px] uppercase tracking-widest" onClick={() => window.location.reload()}>Salir</div>
              <div className={`px-5 py-2 rounded-full font-black text-[11px] uppercase transition-all ${state.turn === state.userColor ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white/40'}`}>
                {state.turn === 'white' ? 'Blancas' : 'Rojas'} {state.gameMode === 'ONLINE' && (state.turn === state.userColor ? '(TÚ)' : '(RIVAL)')}
              </div>
              <div className="flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full">⚙️</button>
                <button onClick={(e) => { e.stopPropagation(); rollDice(); }} disabled={state.movesLeft.length > 0 || (state.gameMode === 'ONLINE' && state.turn !== state.userColor)} className="bg-white text-black font-black px-5 py-2 rounded-full text-[10px] uppercase disabled:opacity-20 active:scale-95 transition-transform">Lanzar</button>
              </div>
            </header>

            <div className="flex-1 relative">
                {showSettings && (
                    <div className="absolute top-4 right-4 z-[100] w-64 p-6 glass rounded-3xl space-y-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Ajustes AR</h3>
                        <div className="space-y-2">
                            <label className="text-[9px] font-bold uppercase text-white/40">Visibilidad Realidad</label>
                            <input type="range" min="0" max="1" step="0.1" value={camOpacity} onChange={e => setCamOpacity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
                        </div>
                        <button onClick={() => setShowSettings(false)} className="w-full py-2 bg-white/10 rounded-xl text-[10px] font-bold uppercase">Listo</button>
                    </div>
                )}
                {state.winner && (
                    <div className="absolute inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
                        <h2 className="text-8xl font-black italic tracking-tighter mb-4 uppercase">¡GANADOR!</h2>
                        <p className="text-yellow-500 font-black uppercase tracking-[0.5em] text-sm mb-12">Jugador {state.winner === 'white' ? 'Blanco' : 'Rojo'}</p>
                        <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-12 py-5 rounded-3xl uppercase text-sm">Volver</button>
                    </div>
                )}
            </div>

            <footer className="h-20 flex items-center justify-between px-12 bg-black/80 backdrop-blur-xl border-t border-white/10">
               <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-white shadow-glow"></div>
                  <span className="text-lg font-black italic">{state.off.white}/15</span>
               </div>
               <div className="flex gap-3">
                  {state.movesLeft.map((m, i) => <div key={i} className="w-10 h-10 bg-yellow-500 text-black font-black flex items-center justify-center rounded-xl animate-bounce shadow-glow">{m}</div>)}
                  {state.movesLeft.length === 0 && <span className="text-white/20 text-[9px] font-black uppercase tracking-[0.2em] animate-pulse">Lanza los dados para mover</span>}
               </div>
               <div className="flex items-center gap-3">
                  <span className="text-lg font-black italic">{state.off.red}/15</span>
                  <div className="w-4 h-4 rounded-full bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]"></div>
               </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
