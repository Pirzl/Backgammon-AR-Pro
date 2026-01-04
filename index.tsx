
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

// --- TIPOS ---
export type Player = 'white' | 'red';
export type View = 'HOME' | 'ONLINE_LOBBY' | 'PLAYING';
export type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

export interface Point {
  checkers: Player[];
}

export interface GrabbedInfo {
  player: Player;
  fromIndex: number; 
  x: number;
  y: number;
}

export interface GameState {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  turn: Player;
  dice: number[];
  movesLeft: number[];
  grabbed: GrabbedInfo | null;
  status: 'READY' | 'WAITING' | 'PLAYING' | 'FINISHED';
  isRolling: boolean;
  winner: Player | null;
  gameMode: GameMode;
  userColor: Player;
  roomID: string;
  boardOpacity: number;
  cameraOpacity: number;
  opponentConnected: boolean;
  hasAccepted: boolean;
  history: any[]; 
}

// --- CONSTANTES ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const CENTER_BAR_WIDTH = 60;
const CHECKER_RADIUS = 24;
const PINCH_THRESHOLD = 0.05;

// Fix Crítico: Usar el mismo origin para evitar bloqueos de CORS
const SERVER_URL = window.location.origin;

const COLORS = {
  white: '#ffffff',
  red: '#ff4444',
  gold: '#fbbf24',
  accent: '#38bdf8'
};

// --- UTILS ---
const playClack = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {}
};

const initialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => {
    for(let i=0; i<n; i++) p[idx].checkers.push(col);
  };
  add(0, 2, 'red');    add(11, 5, 'red');   add(16, 3, 'red');   add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white');  add(5, 5, 'white');
  return p;
};

// --- HOOK: HAND TRACKING ---
const useHandTracking = (videoRef: React.RefObject<HTMLVideoElement | null>, isActive: boolean) => {
  const [isARLoading, setIsARLoading] = useState(true);
  const rawHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, isPinching: false, isDetected: false });
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (!isActive) return;
    let mounted = true;
    const initTracking = async () => {
      const HandsClass = (window as any).Hands;
      const CameraClass = (window as any).Camera;
      if (!HandsClass || !CameraClass || !videoRef.current) {
        if (mounted) setTimeout(initTracking, 300);
        return;
      }
      try {
        const hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        hands.onResults((results: any) => {
          if (!mounted) return;
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            if (indexTip && thumbTip) {
              const distance = Math.sqrt(Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2));
              const nx = (1 - Number(indexTip.x)) * CANVAS_WIDTH;
              const ny = Number(indexTip.y) * CANVAS_HEIGHT;
              if (Number.isFinite(nx) && Number.isFinite(ny)) {
                rawHand.current = { x: nx, y: ny, isPinching: distance < PINCH_THRESHOLD, isDetected: true };
              }
            }
          } else { rawHand.current.isDetected = false; }
        });
        handsRef.current = hands;
        cameraRef.current = new CameraClass(videoRef.current, {
          onFrame: async () => { if (mounted && videoRef.current && handsRef.current) await handsRef.current.send({ image: videoRef.current }); },
          width: 1280, height: 720,
        });
        await cameraRef.current.start();
        if (mounted) setIsARLoading(false);
      } catch (err) {
        if (mounted) setTimeout(initTracking, 1000);
      }
    };
    initTracking();
    return () => { mounted = false; cameraRef.current?.stop(); if (handsRef.current) handsRef.current.close(); };
  }, [isActive, videoRef]);

  return { rawHand, isARLoading };
};

// --- COMPONENTE PRINCIPAL ---
const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState('');
  const [roomFromUrl, setRoomFromUrl] = useState<string | null>(null);
  
  const socketRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mouseState = useRef({ x: 0, y: 0, isDown: false });
  const smoothHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  const lastIsPinching = useRef(false);
  const grabbedRef = useRef<GrabbedInfo | null>(null);
  const isAiActing = useRef(false);

  const { rawHand, isARLoading } = useHandTracking(videoRef, view === 'PLAYING');

  const [state, setState] = useState<GameState>({
    points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], grabbed: null, status: 'READY',
    isRolling: false, winner: null, gameMode: 'LOCAL', userColor: 'white',
    roomID: '', boardOpacity: 0.85, cameraOpacity: 0.45,
    opponentConnected: false, hasAccepted: true, history: []
  });

  const isReversed = useMemo(() => state.gameMode === 'ONLINE' && state.userColor === 'red', [state.gameMode, state.userColor]);

  const showNotify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const initSocket = useCallback((roomID: string, role: Player) => {
    const io = (window as any).io;
    if (!io) { showNotify("ERROR: SOCKET.IO NO DISPONIBLE"); return; }
    if (socketRef.current) socketRef.current.disconnect();

    // Configuración robusta para Cloud Run y CORS
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      withCredentials: true,
      path: '/socket.io/'
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket conectado con exito');
      socket.emit('join-room', { roomID, role });
      showNotify(`CONECTADO A SALA: ${roomID}`);
      
      // Fix Crítico: El invitado notifica explícitamente al anfitrión al conectar
      if (role === 'red') {
        socket.emit('player-ready', { roomID, playerColor: 'red', timestamp: Date.now() });
      }
    });

    socket.on('player-joined', (data: any) => {
      console.log('Nuevo jugador en la sala:', data);
      setState(s => ({ ...s, opponentConnected: true, status: 'PLAYING' }));
      showNotify("¡OPONENTE EN LINEA!");
      
      // Si soy el anfitrión, mando el estado actual para sincronizar
      if (role === 'white') {
        setState(s => {
          socket.emit('update-game', { 
            roomID, 
            gameState: { points: s.points, bar: s.bar, off: s.off, turn: s.turn, dice: s.dice, movesLeft: s.movesLeft, opponentConnected: true } 
          });
          return s;
        });
      }
    });

    // Fix Crítico: Listener para que el anfitrión sepa que el invitado está listo
    socket.on('player-ready', (data: any) => {
      console.log('Recibido player-ready:', data);
      setState(s => ({ ...s, opponentConnected: true, status: 'PLAYING' }));
      showNotify("¡SALA SINCRONIZADA!");
      
      // Forzar envío de estado inicial desde el anfitrión al invitado
      if (role === 'white') {
        setState(s => {
          socket.emit('update-game', { 
            roomID, 
            gameState: { points: s.points, bar: s.bar, off: s.off, turn: s.turn, dice: s.dice, movesLeft: s.movesLeft, opponentConnected: true, status: 'PLAYING' } 
          });
          return s;
        });
      }
    });

    socket.on('update-game', (data: any) => {
      if (data && data.gameState) {
        console.log('Recibida actualización de juego:', data.gameState);
        setState(s => ({ ...s, ...data.gameState, opponentConnected: true, status: 'PLAYING' }));
        if (data.gameState.dice) playClack();
      }
    });

    socket.on('opponent-disconnected', () => {
      setState(s => ({ ...s, opponentConnected: false }));
      showNotify("RIVAL DESCONECTADO");
    });

    socket.on('connect_error', (err: any) => {
      console.error('Error de conexión:', err);
    });

    setState(s => ({ ...s, roomID, userColor: role, gameMode: 'ONLINE', hasAccepted: true }));
    setView('PLAYING');
  }, [showNotify]);

  const copyInvite = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?room=${state.roomID}`;
    navigator.clipboard.writeText(url).then(() => {
      showNotify("¡ENLACE DE INVITACIÓN COPIADO!");
    });
  }, [state.roomID, showNotify]);

  // Sincronización de URL
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room && view === 'HOME') {
      setRoomFromUrl(room.toUpperCase());
    }
  }, [view]);

  // --- LÓGICA DE DADOS ---
  const rollDice = useCallback((forced: boolean = false) => {
    setState(s => {
      if (!forced && (s.movesLeft.length > 0 || s.turn !== s.userColor || s.winner)) return s;
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      playClack();
      const ns: GameState = { ...s, dice: [d1, d2], movesLeft: moves };
      if (ns.gameMode === 'ONLINE' && socketRef.current?.connected) {
        socketRef.current.emit('update-game', { roomID: ns.roomID, gameState: { dice: [d1, d2], movesLeft: moves } });
      }
      return ns;
    });
  }, []);

  // --- LÓGICA DE MOVIMIENTO ---
  const executeMove = (from: number, to: number | 'off', die: number) => {
    playClack();
    setState(curr => {
      const ns = JSON.parse(JSON.stringify(curr)) as GameState;
      const p = ns.turn;
      if (from === -1) ns.bar[p]--; else ns.points[from].checkers.pop();
      if (to === 'off') ns.off[p]++;
      else {
        const target = ns.points[to as number];
        if (target.checkers.length === 1 && target.checkers[0] !== p) { ns.bar[target.checkers[0]]++; target.checkers = [p]; } 
        else target.checkers.push(p);
      }
      const dieIdx = ns.movesLeft.indexOf(die);
      if (dieIdx > -1) ns.movesLeft.splice(dieIdx, 1);
      if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; ns.movesLeft = []; }
      if (ns.off.white === 15) ns.winner = 'white';
      if (ns.off.red === 15) ns.winner = 'red';
      
      if (ns.gameMode === 'ONLINE' && socketRef.current?.connected) {
        socketRef.current.emit('update-game', { 
          roomID: ns.roomID, 
          gameState: { points: ns.points, bar: ns.bar, off: ns.off, turn: ns.turn, dice: ns.dice, movesLeft: ns.movesLeft, winner: ns.winner } 
        });
      }
      return ns;
    });
  };

  const getPointPosition = useCallback((idx: number) => {
    const visualIdx = isReversed ? 23 - idx : idx;
    const isTop = visualIdx >= 12;
    const relIdx = isTop ? 23 - visualIdx : visualIdx;
    const section = relIdx >= 6 ? 1 : 0;
    const boardWidth = 960; 
    const xBase = (CANVAS_WIDTH - boardWidth) / 2;
    const slotWidth = (boardWidth - CENTER_BAR_WIDTH) / 12;
    const x = xBase + (relIdx * slotWidth) + (section * CENTER_BAR_WIDTH);
    return { x: x + slotWidth / 2, y: isTop ? BOARD_PADDING : CANVAS_HEIGHT - BOARD_PADDING, isTop };
  }, [isReversed]);

  const getTargetZone = useCallback((x: number, y: number) => {
    const boardWidth = 960;
    const xBase = (CANVAS_WIDTH - boardWidth) / 2;
    const slotWidth = (boardWidth - CENTER_BAR_WIDTH) / 12;
    if (x < xBase - 20) return { type: 'off' };
    if (Math.abs(x - CANVAS_WIDTH / 2) < 40) return { type: 'bar' };
    for (let i = 0; i < 24; i++) {
      const pos = getPointPosition(i);
      if (Math.abs(x - pos.x) < slotWidth / 2 && ((pos.isTop && y < CANVAS_HEIGHT/2) || (!pos.isTop && y > CANVAS_HEIGHT/2))) return { type: 'point', index: i };
    }
    return null;
  }, [getPointPosition]);

  // --- RENDER LOOP ---
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let animId: number;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animId = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const targetX = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.x : mouseState.current.x;
      const targetY = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.y : mouseState.current.y;
      smoothHand.current.x += (targetX - smoothHand.current.x) * 0.25;
      smoothHand.current.y += (targetY - smoothHand.current.y) * 0.25;
      const { x, y } = smoothHand.current;
      const isPinch = (rawHand.current.isDetected && rawHand.current.isPinching) || mouseState.current.isDown;
      
      if (isPinch && !lastIsPinching.current && state.turn === state.userColor && !state.winner) {
        const zone = getTargetZone(x, y);
        if (zone?.type === 'bar' && state.bar[state.turn] > 0) grabbedRef.current = { player: state.turn, fromIndex: -1, x, y };
        else if (zone?.type === 'point' && state.points[zone.index].checkers.includes(state.turn)) grabbedRef.current = { player: state.turn, fromIndex: zone.index, x, y };
        setState(s => ({ ...s, grabbed: grabbedRef.current }));
      } else if (!isPinch && lastIsPinching.current) {
        if (grabbedRef.current) {
          const tz = getTargetZone(x, y);
          if (tz) {
            const to = tz.type === 'off' ? 'off' : (tz.type === 'point' ? tz.index! : null);
            if (to !== null) {
              const currentDice = state.movesLeft[0] || state.dice[0] || 1;
              executeMove(grabbedRef.current.fromIndex, to as any, currentDice);
            }
          }
        }
        grabbedRef.current = null; setState(s => ({ ...s, grabbed: null }));
      }
      lastIsPinching.current = isPinch;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const bW = 960; const xB = (CANVAS_WIDTH - bW) / 2;
      ctx.globalAlpha = state.boardOpacity;
      ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, bW, CANVAS_HEIGHT - BOARD_PADDING * 2);
      for (let i = 0; i < 24; i++) {
        const pos = getPointPosition(i);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.95)' : 'rgba(190, 160, 110, 0.8)';
        ctx.beginPath(); ctx.moveTo(pos.x - 38, pos.y); ctx.lineTo(pos.x + 38, pos.y); ctx.lineTo(pos.x, pos.isTop ? pos.y + 260 : pos.y - 260); ctx.fill();
        state.points[i].checkers.forEach((p, idx) => { if (grabbedRef.current?.fromIndex === i && idx === state.points[i].checkers.length - 1) return; drawChecker(ctx, pos.x, pos.isTop ? pos.y + 36 + idx * 42 : pos.y - 36 - idx * 42, p); });
      }
      ctx.fillStyle = '#0c0a09'; ctx.fillRect(CANVAS_WIDTH/2 - 32, BOARD_PADDING, 64, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const count = state.bar[p as Player];
        const vY = (p === state.userColor) ? CANVAS_HEIGHT - 120 : 120;
        for(let i=0; i<count; i++) drawChecker(ctx, CANVAS_WIDTH/2, vY + (p === state.userColor ? -i*42 : i*42), p as Player);
      });
      ctx.globalAlpha = 1.0;
      if (state.dice.length > 0) state.dice.forEach((d, i) => drawDie(ctx, CANVAS_WIDTH/2 + (i === 0 ? -160 : 160), CANVAS_HEIGHT/2, d, state.turn));
      if (grabbedRef.current) drawChecker(ctx, x, y, grabbedRef.current.player, true);
      if (rawHand.current.isDetected || mouseState.current.isDown) { ctx.beginPath(); ctx.arc(x, y, isPinch ? 12 : 24, 0, Math.PI * 2); ctx.strokeStyle = isPinch ? COLORS.gold : 'white'; ctx.lineWidth = 3; ctx.stroke(); }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [state, view]);

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, p: Player, glow = false) => {
    ctx.save();
    if (glow) { ctx.shadowBlur = 30; ctx.shadowColor = COLORS.gold; }
    ctx.beginPath(); ctx.arc(x, y, CHECKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p === 'white' ? '#fff' : '#ff4444'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };

  const drawDie = (ctx: CanvasRenderingContext2D, x: number, y: number, v: number, player: Player) => {
    ctx.fillStyle = player === 'white' ? '#fff' : '#ff3333';
    ctx.beginPath(); ctx.roundRect(x-30, y-30, 60, 60, 10); ctx.fill();
    ctx.fillStyle = player === 'white' ? '#000' : '#fff'; ctx.font = 'bold 30px Inter'; ctx.textAlign = 'center'; ctx.fillText(v.toString(), x, y+10);
  };

  const handlePointer = (e: any) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX || (e.touches && e.touches[0].clientX);
    const cy = e.clientY || (e.touches && e.touches[0].clientY);
    const scale = Math.min(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
    const ox = (rect.width - CANVAS_WIDTH * scale) / 2;
    const oy = (rect.height - CANVAS_HEIGHT * scale) / 2;
    mouseState.current = { ...mouseState.current, x: (cx - rect.left - ox) / scale, y: (cy - rect.top - oy) / scale };
  };

  return (
    <div className="w-full h-full bg-black relative overflow-hidden select-none" 
         onMouseMove={handlePointer} onTouchMove={handlePointer}
         onMouseDown={() => mouseState.current.isDown = true} onMouseUp={() => mouseState.current.isDown = false}
         onTouchStart={(e) => { mouseState.current.isDown = true; handlePointer(e); }} onTouchEnd={() => mouseState.current.isDown = false}>
      
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-600 text-black font-black px-10 py-4 rounded-full z-[300] border-4 border-black uppercase text-[10px] tracking-widest animate-bounce">
          {notification}
        </div>
      )}

      {view === 'HOME' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-10">
          <h1 className="text-9xl font-black italic tracking-tighter mb-10 text-white">B-GAMMON</h1>
          {roomFromUrl ? (
            <div className="bg-stone-900 p-10 rounded-[3rem] text-center border border-white/10 shadow-4xl animate-in fade-in zoom-in duration-500">
               <h2 className="text-white font-black text-2xl uppercase mb-4 italic">Invitación de Sala</h2>
               <div className="text-yellow-600 text-5xl font-black mb-8 tracking-widest">{roomFromUrl}</div>
               <button 
                  onClick={() => initSocket(roomFromUrl, 'red')} 
                  className="bg-yellow-600 text-black font-black py-6 px-20 rounded-2xl text-xl hover:scale-105 active:scale-95 transition-all uppercase shadow-3xl">
                  ACEPTAR E INICIAR
               </button>
               <button onClick={() => setRoomFromUrl(null)} className="mt-6 block w-full text-white/20 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Rechazar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-64">
              <button onClick={() => { setState(s => ({...s, gameMode: 'AI', hasAccepted: true})); setView('PLAYING'); }} className="bg-white text-black font-black py-4 rounded-xl text-lg uppercase hover:scale-105 active:scale-95 transition-all">Vs Máquina</button>
              <button onClick={() => setView('ONLINE_LOBBY')} className="bg-stone-800 text-white font-black py-4 rounded-xl text-lg uppercase hover:scale-105 active:scale-95 transition-all border border-white/5">Online</button>
            </div>
          )}
        </div>
      )}

      {view === 'ONLINE_LOBBY' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-10 space-y-6">
          <button onClick={() => initSocket(Math.random().toString(36).substring(2, 8).toUpperCase(), 'white')} className="w-64 bg-yellow-600 text-black font-black py-4 rounded-xl uppercase hover:scale-105 active:scale-95 transition-all">Crear Sala</button>
          <div className="flex gap-2">
            <input type="text" placeholder="ID" value={joinIdInput} onChange={(e) => setJoinIdInput(e.target.value.toUpperCase())} className="bg-stone-900 border border-white/10 rounded-xl px-4 text-center font-black uppercase text-white w-40 outline-none focus:border-yellow-600 transition-colors" />
            <button onClick={() => initSocket(joinIdInput, 'red')} className="bg-white text-black font-black px-6 py-4 rounded-xl uppercase hover:scale-105 active:scale-95 transition-all">Unirse</button>
          </div>
          <button onClick={() => setView('HOME')} className="text-white/30 text-[10px] uppercase font-bold tracking-widest hover:text-white transition-colors">Volver</button>
        </div>
      )}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-xl">
            <div className="flex items-center gap-6">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1 hover:bg-stone-700 transition-colors">
                <div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div>
              </button>
              {state.gameMode === 'ONLINE' && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-black tracking-widest text-white/40 uppercase">{state.roomID}</span>
                  <span className={`text-[10px] font-bold tracking-widest uppercase ${state.opponentConnected ? 'text-green-500' : 'text-yellow-600 animate-pulse'}`}>
                    {state.opponentConnected ? 'CONECTADO' : 'ESPERANDO...'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-4 items-center">
              {state.userColor === 'white' && state.gameMode === 'ONLINE' && (
                <button onClick={copyInvite} className="bg-stone-800 p-3 rounded-xl border border-white/5 text-yellow-600 uppercase font-black text-[10px] tracking-widest hover:bg-stone-700 active:scale-95 transition-all">INVITAR</button>
              )}
              <div className={`px-8 py-2.5 rounded-full font-black text-[10px] tracking-widest uppercase border-2 transition-all ${state.turn === state.userColor ? 'bg-yellow-600 text-black border-yellow-600' : 'text-white/30 border-white/10'}`}>
                {state.turn === state.userColor ? 'TU TURNO' : 'TURNO RIVAL'}
              </div>
              <button 
                onClick={() => rollDice()} 
                disabled={state.movesLeft.length > 0 || state.turn !== state.userColor || !!state.winner} 
                className="bg-white text-black font-black px-8 py-2.5 rounded-full text-[10px] disabled:opacity-10 uppercase hover:scale-105 active:scale-95 transition-all shadow-xl">
                Tirar
              </button>
            </div>
          </header>

          <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
            {isARLoading && (
              <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white/40 font-black tracking-[0.3em] uppercase text-[10px]">Cargando AR...</p>
              </div>
            )}
            <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-cover grayscale brightness-50" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-10 pointer-events-none drop-shadow-2xl max-w-full max-h-full" />
            
            {state.winner && (
              <div className="absolute inset-0 z-[200] bg-stone-950/90 flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in zoom-in duration-700">
                <div className="text-center p-12 border border-white/5 rounded-[4rem] bg-stone-900/50 shadow-4xl">
                  <h2 className="text-8xl font-black text-yellow-600 italic mb-2 tracking-tighter uppercase">{state.winner === state.userColor ? 'VICTORIA' : 'DERROTA'}</h2>
                  <p className="text-white/40 font-bold uppercase tracking-[0.5em] text-xs mb-10">Partida Finalizada</p>
                  <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-16 py-6 rounded-full uppercase tracking-widest active:scale-95 shadow-4xl hover:bg-yellow-600 transition-all">Continuar</button>
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
