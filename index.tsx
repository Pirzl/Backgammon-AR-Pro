
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- SILENCIADOR DE ERRORES ---
window.addEventListener('error', (e) => {
  const ignored = ['WebSocket', 'PeerJS', 'ServiceWorker', 'refresh.js'];
  if (ignored.some(msg => (e.message || '').includes(msg))) {
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// --- AUDIO ---
const playSound = (type: 'dice' | 'checker' | 'win') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    if (type === 'dice') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'noise' as any; // Simplified noise
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(now + 0.1);
    } else if (type === 'checker') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(now + 0.1);
    }
  } catch(e) {}
};

// --- CONSTANTS ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const CENTER_BAR_WIDTH = 60;
const CHECKER_RADIUS = 26;
const COLORS = { white: '#ffffff', red: '#ff2222', gold: '#fbbf24' };

type Player = 'white' | 'red';
type View = 'HOME' | 'ONLINE_LOBBY' | 'INVITE_SENT' | 'PLAYING' | 'CONNECTING';
type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'WAITING_FOR_HOST' | 'SYNCING' | 'READY' | 'ERROR';

interface Point { checkers: Player[]; }
interface GameState {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  turn: Player;
  dice: number[];
  movesLeft: number[];
  winner: Player | null;
  gameMode: 'AI' | 'ONLINE' | 'LOCAL';
  userColor: Player;
  roomID: string;
  isHost: boolean;
  boardOpacity: number;
  cameraOpacity: number;
  isFlipped: boolean;
  connStatus: ConnectionStatus;
}

const initialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => { for(let i=0; i<n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return p;
};

// --- APP ---
const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [connLogs, setConnLogs] = useState<string[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const stateRef = useRef<GameState>({
    points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null, gameMode: 'LOCAL',
    userColor: 'white', roomID: '', isHost: true, boardOpacity: 0.9,
    cameraOpacity: 0.35, isFlipped: false, connStatus: 'IDLE'
  });

  const [state, setState] = useState<GameState>(stateRef.current);
  useEffect(() => { stateRef.current = state; }, [state]);

  const addLog = (msg: string) => setConnLogs(prev => [...prev.slice(-2), msg]);

  const broadcastState = useCallback((newState: Partial<GameState>) => {
    if (connRef.current?.open && stateRef.current.gameMode === 'ONLINE') {
      connRef.current.send({ type: 'STATE_UPDATE', payload: newState });
    }
  }, []);

  const setupConnection = (conn: any) => {
    connRef.current = conn;
    
    conn.on('open', () => {
      addLog("¡Canal de datos abierto!");
      setState(s => ({ ...s, connStatus: 'SYNCING' }));
      // El Host envía el estado inicial solo si es host
      if (stateRef.current.isHost) {
        setTimeout(() => {
            if (conn.open) conn.send({ type: 'INIT_SYNC', payload: stateRef.current });
        }, 500);
      }
    });

    conn.on('data', (data: any) => {
      const { type, payload } = data;
      if (type === 'INIT_SYNC' || type === 'STATE_UPDATE') {
        setState(s => ({ 
            ...s, ...payload, 
            userColor: s.userColor, isHost: s.isHost, roomID: s.roomID, 
            connStatus: 'READY' 
        }));
        if (view !== 'PLAYING') setView('PLAYING');
      }
      if (type === 'REQUEST_SYNC' && stateRef.current.isHost) {
        conn.send({ type: 'STATE_UPDATE', payload: stateRef.current });
      }
    });

    conn.on('close', () => {
      addLog("Conexión perdida.");
      setState(s => ({ ...s, connStatus: 'ERROR' }));
    });
  };

  const initPeer = useCallback((roomID: string, asHost: boolean) => {
    if (peerRef.current) peerRef.current.destroy();
    
    const id = asHost ? `bgammon-${roomID}-host` : `bgammon-${roomID}-guest-${Math.random().toString(36).substring(7)}`;
    const peer = new (window as any).Peer(id, {
        debug: 1,
        config: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }, { 'urls': 'stun:stun1.l.google.com:19302' }] }
    });
    peerRef.current = peer;

    peer.on('open', () => {
      addLog(asHost ? "Esperando rival..." : "Conectando a sala...");
      setState(s => ({ ...s, connStatus: asHost ? 'IDLE' : 'CONNECTING' }));
      if (!asHost) {
        const conn = peer.connect(`bgammon-${roomID}-host`, { reliable: true });
        setupConnection(conn);
      }
    });

    peer.on('connection', (conn: any) => {
      if (asHost) {
        addLog("Rival detectado.");
        setupConnection(conn);
      }
    });

    peer.on('error', (err: any) => {
        addLog(`Error P2P: ${err.type}`);
        if (err.type === 'peer-unavailable' && !asHost) {
            setTimeout(() => initPeer(roomID, false), 3000);
        }
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && view === 'HOME') {
      const rid = room.toUpperCase();
      setState(s => ({ ...s, roomID: rid, userColor: 'red', gameMode: 'ONLINE', isHost: false }));
      initPeer(rid, false);
      setView('CONNECTING');
    }
  }, [initPeer, view]);

  // --- AR ---
  useEffect(() => {
    if (view !== 'PLAYING') return;
    const Hands = (window as any).Hands;
    const Camera = (window as any).Camera;
    if (!Hands || !Camera || !videoRef.current) return;

    const hands = new Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    
    const camera = new Camera(videoRef.current, { 
      onFrame: async () => { if (videoRef.current) await hands.send({ image: videoRef.current }); },
      width: 1280, height: 720 
    });
    camera.start();
    return () => camera.stop();
  }, [view]);

  // --- RENDER ---
  useEffect(() => {
    if (view !== 'PLAYING') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let anim: number;

    const render = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const s = stateRef.current;
      const xB = (CANVAS_WIDTH - 900) / 2 + 50;
      
      // Fondo tablero
      ctx.save(); ctx.globalAlpha = s.boardOpacity; ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, 900, CANVAS_HEIGHT - BOARD_PADDING * 2); ctx.restore();

      // Bear-off (Siempre a la izquierda)
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, BOARD_PADDING, xB - 10, CANVAS_HEIGHT - BOARD_PADDING * 2);
      
      // Fichas retiradas
      for(let i=0; i<s.off.white; i++) {
        ctx.beginPath(); ctx.arc(40, CANVAS_HEIGHT - 60 - i*12, 20, 0, Math.PI*2); ctx.fillStyle = COLORS.white; ctx.fill();
      }
      for(let i=0; i<s.off.red; i++) {
        ctx.beginPath(); ctx.arc(40, 60 + i*12, 20, 0, Math.PI*2); ctx.fillStyle = COLORS.red; ctx.fill();
      }

      // Dados
      if (s.dice.length) {
        ctx.fillStyle = s.turn === 'white' ? '#fff' : '#f22';
        ctx.fillRect(xB + 400, CANVAS_HEIGHT/2 - 30, 60, 60);
        ctx.fillRect(xB + 480, CANVAS_HEIGHT/2 - 30, 60, 60);
      }

      anim = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(anim);
  }, [view]);

  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      {view === 'HOME' && (
        <div className="text-center space-y-8 animate-in fade-in duration-700">
          <h1 className="text-8xl font-black italic tracking-tighter">B-GAMMON</h1>
          <div className="flex flex-col gap-4 w-64 mx-auto">
            <button onClick={() => setView('ONLINE_LOBBY')} className="bg-white text-black font-black py-4 rounded-xl uppercase">Multijugador</button>
            <button onClick={() => { setState(s => ({ ...s, gameMode: 'LOCAL' })); setView('PLAYING'); }} className="bg-stone-900 text-white/50 font-black py-4 rounded-xl text-xs uppercase">Local</button>
          </div>
        </div>
      )}

      {view === 'ONLINE_LOBBY' && (
        <div className="bg-stone-900 p-12 rounded-[3rem] border border-white/5 text-center space-y-6">
          <h2 className="text-4xl font-black italic">SALA ONLINE</h2>
          <button onClick={() => {
            const rid = Math.random().toString(36).substring(7).toUpperCase();
            setState(s => ({ ...s, roomID: rid, isHost: true, gameMode: 'ONLINE' }));
            initPeer(rid, true);
            setView('INVITE_SENT');
          }} className="w-full bg-yellow-600 text-black font-black py-5 rounded-2xl uppercase">Crear Sala</button>
          <button onClick={() => setView('HOME')} className="text-white/30 text-xs uppercase">Volver</button>
        </div>
      )}

      {view === 'INVITE_SENT' && (
        <div className="bg-stone-900 p-12 rounded-[4rem] border border-white/5 text-center space-y-8 max-w-lg">
          <h3 className="text-2xl font-black italic">¡SALA LISTA!</h3>
          <div className="bg-black/50 p-4 rounded-xl font-mono text-yellow-600 text-xs break-all">
            {`${window.location.origin}${window.location.pathname}?room=${state.roomID}`}
          </div>
          <button onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.roomID}`);
            setConnLogs(["¡Link copiado al portapapeles!"]);
          }} className="w-full bg-white text-black font-black py-4 rounded-xl uppercase">Copiar Link</button>
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-white/40 uppercase animate-pulse">Esperando conexión...</p>
            {connLogs.map((log, i) => <div key={i} className="text-[9px] text-yellow-600/50 uppercase">{log}</div>)}
          </div>
        </div>
      )}

      {view === 'CONNECTING' && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-black uppercase tracking-widest animate-pulse">Sincronizando Tablero...</p>
          <div className="flex flex-col items-center">
            {connLogs.map((log, i) => <div key={i} className="text-[10px] text-white/20 uppercase">{log}</div>)}
          </div>
        </div>
      )}

      {view === 'PLAYING' && (
        <div className="w-full h-full relative flex flex-col">
          <header className="h-16 bg-stone-900/80 backdrop-blur flex items-center justify-between px-6 z-50">
            <button onClick={() => setIsMenuOpen(true)} className="w-10 h-10 bg-stone-800 rounded-lg">☰</button>
            <div className="bg-yellow-600 text-black px-6 py-1.5 rounded-full font-black text-[10px] uppercase">
                {state.turn === state.userColor ? 'TU TURNO' : 'ESPERANDO...'}
            </div>
            <button className="bg-white text-black px-6 py-1.5 rounded-full font-black text-[10px]">LANZAR</button>
          </header>
          <main className="flex-1 relative">
            <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-20 w-full h-full object-contain pointer-events-none" />
          </main>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
