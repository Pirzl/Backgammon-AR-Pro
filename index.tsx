
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- CONFIG ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const COLORS = { white: '#ffffff', red: '#ff2222', gold: '#fbbf24' };

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
  cameraOpacity: number;
}

const getInitialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => { for(let i=0; i<n; i++) p[idx].checkers.push(col); };
  // Setup clásico
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return p;
};

const App: React.FC = () => {
  const [view, setView] = useState<'HOME' | 'LOBBY' | 'INVITE' | 'PLAYING' | 'CONNECTING'>('HOME');
  const [logs, setLogs] = useState<string[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  const [state, setState] = useState<GameState>({
    points: getInitialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null, gameMode: 'LOCAL',
    userColor: 'white', roomID: '', isHost: true, cameraOpacity: 0.4
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const addLog = (m: string) => setLogs(p => [...p.slice(-2), m]);

  // --- REGLAS ---
  const getTargetIndex = (from: number, die: number, player: Player) => {
    if (from === -1) return player === 'red' ? die - 1 : 24 - die;
    return player === 'red' ? from + die : from - die;
  };

  const isBearOffReady = (points: Point[], player: Player) => {
    const homeRange = player === 'red' ? [18, 23] : [0, 5];
    return points.every((p, i) => {
      if (!p.checkers.includes(player)) return true;
      return i >= homeRange[0] && i <= homeRange[1];
    });
  };

  const canMove = (from: number, to: number | 'off', die: number, gs: GameState): boolean => {
    const p = gs.turn;
    if (!gs.movesLeft.includes(die)) return false;
    if (gs.bar[p] > 0 && from !== -1) return false;

    if (to === 'off') {
      if (!isBearOffReady(gs.points, p)) return false;
      const isExact = p === 'red' ? (from + die === 24) : (from - die === -1);
      if (isExact) return true;
      // Regla de ficha más lejana
      if (p === 'red' && from + die > 23) {
        for(let i=18; i < from; i++) if(gs.points[i].checkers.includes('red')) return false;
        return true;
      }
      if (p === 'white' && from - die < 0) {
        for(let i=5; i > from; i--) if(gs.points[i].checkers.includes('white')) return false;
        return true;
      }
      return false;
    }

    if (to < 0 || to > 23) return false;
    const target = gs.points[to as number];
    if (target.checkers.length > 1 && target.checkers[0] !== p) return false;
    return true;
  };

  const executeMove = (from: number, to: number | 'off', die: number) => {
    setState(prev => {
      const ns = JSON.parse(JSON.stringify(prev)) as GameState;
      const p = ns.turn;
      
      if (from === -1) ns.bar[p]--; else ns.points[from].checkers.pop();

      if (to === 'off') {
        ns.off[p]++;
      } else {
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
  };

  const rollDice = () => {
    if (state.movesLeft.length > 0 || isRolling) return;
    setIsRolling(true);
    setTimeout(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      setState(prev => {
        const ns = { ...prev, dice: [d1, d2], movesLeft: moves };
        if (ns.gameMode === 'ONLINE' && connRef.current?.open) connRef.current.send({ type: 'STATE_UPDATE', payload: ns });
        return ns;
      });
      setIsRolling(false);
    }, 600);
  };

  // --- IA LOGIC ---
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn === 'red' && !state.winner && view === 'PLAYING') {
      const timer = setTimeout(() => {
        if (state.movesLeft.length === 0 && !isRolling) {
          rollDice();
        } else if (state.movesLeft.length > 0) {
          const die = state.movesLeft[0];
          let moved = false;
          // Lógica simplificada: priorizar salir de la barra, luego mover normal
          if (state.bar.red > 0) {
            const to = getTargetIndex(-1, die, 'red');
            if (canMove(-1, to, die, state)) { executeMove(-1, to, die); moved = true; }
          } else {
            for (let i = 0; i < 24; i++) {
              if (state.points[i].checkers.includes('red')) {
                const to = getTargetIndex(i, die, 'red');
                if (canMove(i, to, die, state)) { executeMove(i, to, die); moved = true; break; }
                if (isBearOffReady(state.points, 'red') && canMove(i, 'off', die, state)) { executeMove(i, 'off', die); moved = true; break; }
              }
            }
          }
          if (!moved) setState(p => ({...p, turn: 'white', dice: [], movesLeft: []}));
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.turn, state.movesLeft, state.gameMode, view]);

  // --- CONNECTIVITY ---
  const initP2P = (rid: string, isHost: boolean) => {
    if (peerRef.current) peerRef.current.destroy();
    const id = isHost ? `bgammon-${rid}-host` : `bgammon-${rid}-guest-${Math.random().toString(36).substring(5)}`;
    const peer = new (window as any).Peer(id);
    peerRef.current = peer;

    peer.on('open', (myId: string) => {
      addLog(isHost ? "Sala creada." : "ID de invitado listo.");
      if (!isHost) {
        addLog("Conectando con Host...");
        const conn = peer.connect(`bgammon-${rid}-host`, { reliable: true });
        connRef.current = conn;
        conn.on('open', () => {
          addLog("Conexión establecida.");
          conn.on('data', (data: any) => {
            if (data.type === 'INIT_SYNC' || data.type === 'STATE_UPDATE') {
              setState(s => ({ ...s, ...data.payload, userColor: s.userColor, roomID: s.roomID }));
              setView('PLAYING');
            }
          });
        });
      } else {
        peer.on('connection', (conn: any) => {
          addLog("¡Rival ha entrado!");
          connRef.current = conn;
          conn.on('open', () => {
            conn.send({ type: 'INIT_SYNC', payload: stateRef.current });
            setView('PLAYING');
          });
          conn.on('data', (data: any) => {
            if (data.type === 'STATE_UPDATE') setState(s => ({ ...s, ...data.payload, userColor: s.userColor }));
          });
        });
      }
    });
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room && view === 'HOME') {
      const rid = room.toUpperCase();
      setState(s => ({ ...s, roomID: rid, userColor: 'red', gameMode: 'ONLINE', isHost: false }));
      setView('CONNECTING');
      initP2P(rid, false);
    }
  }, []);

  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center font-sans">
      {view === 'HOME' && (
        <div className="text-center animate-in zoom-in duration-500">
          <h1 className="text-7xl font-black italic mb-12 tracking-tighter text-white shadow-glow">B-GAMMON</h1>
          <div className="flex flex-col gap-4 w-72 mx-auto">
            <button onClick={() => { setState(s => ({ ...s, gameMode: 'AI', userColor: 'white' })); setView('PLAYING'); }} 
                    className="bg-white text-black font-black py-5 rounded-2xl hover:scale-105 transition-transform uppercase shadow-lg">Vs Máquina</button>
            <button onClick={() => setView('LOBBY')} 
                    className="bg-stone-800 text-white font-black py-5 rounded-2xl hover:bg-stone-700 transition-colors uppercase">Multijugador</button>
          </div>
        </div>
      )}

      {view === 'LOBBY' && (
        <div className="bg-stone-900 p-10 rounded-[2.5rem] border border-white/10 text-center space-y-8 animate-in slide-in-from-bottom duration-300">
          <h2 className="text-3xl font-black italic uppercase">Multijugador</h2>
          <button onClick={() => {
            const rid = Math.random().toString(36).substring(7).toUpperCase();
            setState(s => ({ ...s, roomID: rid, isHost: true, gameMode: 'ONLINE', userColor: 'white' }));
            initP2P(rid, true);
            setView('INVITE');
          }} className="w-full bg-yellow-600 text-black font-semibold py-4 rounded-xl uppercase shadow-xl">Crear Nueva Sala</button>
          <button onClick={() => setView('HOME')} className="text-white/40 uppercase text-xs font-bold">Cancelar</button>
        </div>
      )}

      {view === 'INVITE' && (
        <div className="bg-stone-900 p-10 rounded-[2.5rem] border border-white/10 text-center space-y-6 max-w-sm">
          <h2 className="text-2xl font-black italic uppercase">Invitar Amigo</h2>
          <div className="bg-black/50 p-4 rounded-xl font-mono text-yellow-500 text-[10px] break-all border border-white/5">
            {`${window.location.origin}${window.location.pathname}?room=${state.roomID}`}
          </div>
          <button onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.roomID}`);
            addLog("Enlace Copiado");
          }} className="w-full bg-white text-black font-black py-4 rounded-xl uppercase">Copiar Enlace</button>
          <div className="pt-4 border-t border-white/5">
            <p className="text-[10px] text-white/40 uppercase font-black animate-pulse">Esperando al oponente...</p>
            {logs.map((l, i) => <p key={i} className="text-[9px] text-yellow-500/60 mt-1 uppercase font-bold">{l}</p>)}
          </div>
        </div>
      )}

      {view === 'CONNECTING' && (
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-white font-black uppercase tracking-tighter animate-pulse">Sincronizando...</p>
          <p className="text-[10px] text-white/20 mt-2 uppercase">{logs[logs.length-1]}</p>
        </div>
      )}

      {view === 'PLAYING' && (
        <div className="w-full h-full relative flex flex-col">
          <header className="h-16 bg-stone-900/95 border-b border-white/10 flex items-center justify-between px-8 z-50">
            <button onClick={() => setView('HOME')} className="text-white/40 text-xs font-bold uppercase hover:text-white">Salir</button>
            <div className={`px-5 py-1.5 rounded-full font-black text-[10px] uppercase border transition-all ${state.turn === state.userColor ? 'bg-yellow-600 border-yellow-600 text-black shadow-glow' : 'text-white/30 border-white/10'}`}>
               Turno: {state.turn === 'white' ? 'Blanco' : 'Rojo'} {state.turn === state.userColor ? '(Tú)' : ''}
            </div>
            <button onClick={rollDice} disabled={state.movesLeft.length > 0 || isRolling || (state.gameMode === 'ONLINE' && state.turn !== state.userColor)} 
                    className="bg-white text-black font-black px-5 py-1.5 rounded-full text-[10px] uppercase shadow-lg disabled:opacity-20 active:scale-95 transition-transform">
              {isRolling ? '...' : 'Lanzar'}
            </button>
          </header>
          
          <main className="flex-1 relative overflow-hidden flex items-center justify-center">
             <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: state.cameraOpacity }} autoPlay playsInline muted />
             <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-10 w-full h-full object-contain pointer-events-none" />
             
             {state.winner && (
               <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in">
                 <h2 className="text-7xl font-black italic text-white uppercase mb-4 tracking-tighter">¡VICTORIA!</h2>
                 <p className="text-yellow-500 font-bold uppercase mb-12">El jugador {state.winner === 'white' ? 'Blanco' : 'Rojo'} domina el tablero</p>
                 <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-16 py-5 rounded-2xl uppercase hover:bg-yellow-500 transition-colors">Volver al Inicio</button>
               </div>
             )}
          </main>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
