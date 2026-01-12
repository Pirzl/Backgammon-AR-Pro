
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- SILENCIADOR DE ERRORES (Jules Auditor) ---
window.addEventListener('error', (e) => {
  const ignored = ['WebSocket', 'PeerJS', 'message channel', 'favicon', 'refresh.js'];
  if (ignored.some(msg => (e.message || '').includes(msg))) {
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// --- AUDIO ENGINE ---
const playSound = (type: 'dice' | 'checker' | 'win') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    if (type === 'dice') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      source.connect(gain); gain.connect(ctx.destination);
      source.start();
    } else if (type === 'checker') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(now + 0.1);
    } else if (type === 'win') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(now + 0.5);
    }
  } catch(e) {}
};

// --- TYPES & CONSTANTS ---
type Player = 'white' | 'red';
type View = 'HOME' | 'ONLINE_LOBBY' | 'INVITE_SENT' | 'PLAYING' | 'CONNECTING';
type GameMode = 'AI' | 'ONLINE' | 'LOCAL';
type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'WAITING_FOR_HOST' | 'SYNCING' | 'READY' | 'ERROR';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const CENTER_BAR_WIDTH = 60;
const CHECKER_RADIUS = 26;
const AR_STABILIZATION_THRESHOLD = 5;
const PINCH_THRESHOLD = 0.5;
const COLORS = { white: '#ffffff', red: '#ff2222', gold: '#fbbf24' };

interface Point { checkers: Player[]; }
interface GrabbedInfo { player: Player; fromIndex: number; x: number; y: number; isMouse: boolean; offsetY: number; }

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
  boardOpacity: number;
  cameraOpacity: number;
  isBlocked: boolean;
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

// --- LOGIC HELPERS ---
const getTargetPoint = (player: Player, from: number, die: number) => {
  if (from === -1) return player === 'red' ? die - 1 : 24 - die;
  return player === 'red' ? from + die : from - die;
};

const isValidMove = (state: GameState, player: Player, from: number, to: number | 'off', dieValue: number): boolean => {
  if (!state.movesLeft.includes(dieValue)) return false;
  if (state.bar[player] > 0 && from !== -1) return false;
  const target = getTargetPoint(player, from, dieValue);
  
  if (to === 'off') {
    const range = player === 'red' ? [18, 23] : [0, 5];
    if (state.bar[player] > 0) return false;
    for (let i = 0; i < 24; i++) {
      if ((i < range[0] || i > range[1]) && state.points[i].checkers.includes(player)) return false;
    }
    const isExact = player === 'red' ? (from + dieValue === 24) : (from - dieValue === -1);
    if (isExact) return true;
    if (player === 'red' && from + dieValue > 23) {
      for(let i=18; i<from; i++) if(state.points[i].checkers.includes('red')) return false;
      return true;
    }
    if (player === 'white' && from - dieValue < 0) {
      for(let i=5; i>from; i--) if(state.points[i].checkers.includes('white')) return false;
      return true;
    }
    return false;
  }
  
  if (target !== to || target < 0 || target > 23) return false;
  const destPoint = state.points[target];
  return !(destPoint.checkers.length > 1 && destPoint.checkers[0] !== player);
};

const hasAnyLegalMove = (state: GameState): boolean => {
  if (state.movesLeft.length === 0) return true;
  const p = state.turn;
  const diceUniq = Array.from(new Set<number>(state.movesLeft));
  if (state.bar[p] > 0) return diceUniq.some(die => isValidMove(state, p, -1, getTargetPoint(p, -1, die), die));
  for (let i = 0; i < 24; i++) {
    if (state.points[i].checkers.includes(p)) {
      if (diceUniq.some(die => {
        const target = getTargetPoint(p, i, die);
        return (target >= 0 && target <= 23) ? isValidMove(state, p, i, target, die) : isValidMove(state, p, i, 'off', die);
      })) return true;
    }
  }
  return false;
};

// --- APP COMPONENT ---
const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const smoothHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  const pinchBuffer = useRef<number>(0);
  const grabbedRef = useRef<GrabbedInfo | null>(null);
  
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const reconnectTimeout = useRef<any>(null);

  const [state, setState] = useState<GameState>({
    points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], winner: null, gameMode: 'LOCAL',
    userColor: 'white', roomID: '', isHost: true, boardOpacity: 0.9,
    cameraOpacity: 0.35, isBlocked: false, isFlipped: false, connStatus: 'IDLE'
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const broadcastState = useCallback((newState: Partial<GameState>) => {
    if (connRef.current?.open && stateRef.current.gameMode === 'ONLINE') {
      connRef.current.send({ type: 'STATE_UPDATE', payload: newState });
    }
  }, []);

  // --- MULTIPLAYER CORE ---
  const initPeer = useCallback((roomID: string, asHost: boolean) => {
    if (peerRef.current) peerRef.current.destroy();
    
    const id = asHost ? `bgammon-${roomID}-host` : `bgammon-${roomID}-guest-${Math.random().toString(36).substring(7)}`;
    const peer = new (window as any).Peer(id, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', () => {
      setState(s => ({ ...s, connStatus: asHost ? 'IDLE' : 'CONNECTING' }));
      if (!asHost) connectToHost(roomID);
    });

    peer.on('connection', (conn: any) => {
      if (asHost) {
        connRef.current = conn;
        setupConnection(conn);
      }
    });

    peer.on('error', (err: any) => {
      console.warn('Peer error:', err.type);
      if (err.type === 'peer-unavailable' && !asHost) {
        reconnectTimeout.current = setTimeout(() => connectToHost(roomID), 3000);
      }
    });
  }, []);

  const connectToHost = (roomID: string) => {
    const conn = peerRef.current.connect(`bgammon-${roomID}-host`, { reliable: true });
    setupConnection(conn);
  };

  const setupConnection = (conn: any) => {
    connRef.current = conn;
    conn.on('open', () => {
      setState(s => ({ ...s, connStatus: 'SYNCING' }));
      if (stateRef.current.isHost) {
        conn.send({ type: 'INIT_SYNC', payload: stateRef.current });
      }
    });

    conn.on('data', (data: any) => {
      const { type, payload } = data;
      if (type === 'INIT_SYNC' || type === 'STATE_UPDATE') {
        setState(s => ({ ...s, ...payload, userColor: s.userColor, isHost: s.isHost, roomID: s.roomID, connStatus: 'READY' }));
        if (view === 'CONNECTING' || view === 'INVITE_SENT') setView('PLAYING');
      }
    });

    conn.on('close', () => {
      setState(s => ({ ...s, connStatus: 'ERROR' }));
      if (!stateRef.current.isHost) setTimeout(() => connectToHost(stateRef.current.roomID), 2000);
    });
  };

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

  // --- AR & RENDER ---
  const [isARLoading, setIsARLoading] = useState(true);
  const rawHand = useRef({ x: 0, y: 0, isPinching: false, isDetected: false });

  useEffect(() => {
    if (view !== 'PLAYING') return;
    let camera: any = null;
    const Hands = (window as any).Hands;
    const Camera = (window as any).Camera;

    if (!Hands || !Camera || !videoRef.current) { setIsARLoading(false); return; }

    const hands = new Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

    hands.onResults((results: any) => {
      if (!results.multiHandLandmarks?.length) { rawHand.current.isDetected = false; return; }
      const l = results.multiHandLandmarks[0];
      const palmSize = Math.sqrt(Math.pow(l[0].x - l[9].x, 2) + Math.pow(l[0].y - l[9].y, 2));
      const pinchDist = Math.sqrt(Math.pow(l[8].x - l[4].x, 2) + Math.pow(l[8].y - l[4].y, 2));
      rawHand.current = { 
        x: (1 - l[8].x) * CANVAS_WIDTH, 
        y: l[8].y * CANVAS_HEIGHT, 
        isPinching: (pinchDist / palmSize) < PINCH_THRESHOLD,
        isDetected: true 
      };
    });

    camera = new Camera(videoRef.current, { 
      onFrame: async () => { if (videoRef.current) await hands.send({ image: videoRef.current }); },
      width: 1280, height: 720 
    });
    camera.start().then(() => setIsARLoading(false));

    return () => { if (camera) camera.stop(); };
  }, [view]);

  // --- GAME ACTIONS ---
  const executeMove = (from: number, to: number | 'off', die: number) => {
    const s = stateRef.current;
    if (!isValidMove(s, s.turn, from, to, die)) return;
    playSound('checker');

    setState(curr => {
      const ns = JSON.parse(JSON.stringify(curr)) as GameState;
      const p = ns.turn;
      if (from === -1) ns.bar[p]--; else ns.points[from].checkers.pop();
      
      if (to === 'off') ns.off[p]++;
      else {
        const target = ns.points[to as number];
        if (target.checkers.length === 1 && target.checkers[0] !== p) {
          ns.bar[target.checkers[0]]++; target.checkers = [p];
        } else target.checkers.push(p);
      }

      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.off.white === 15) ns.winner = 'white';
      else if (ns.off.red === 15) ns.winner = 'red';

      if (ns.winner) { playSound('win'); ns.movesLeft = []; }
      else if (ns.movesLeft.length === 0 || !hasAnyLegalMove(ns)) {
        ns.turn = ns.turn === 'white' ? 'red' : 'white';
        ns.dice = []; ns.movesLeft = [];
      }
      
      broadcastState(ns);
      return ns;
    });
  };

  const getPos = useCallback((idx: number, isRed: boolean, isFlipped: boolean) => {
    let effective = isRed ? 23 - idx : idx;
    if (isFlipped) effective = 23 - effective;
    const isTop = effective >= 12;
    const relIdx = isTop ? 23 - effective : effective;
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50;
    const x = xBase + (relIdx * 70) + (relIdx >= 6 ? CENTER_BAR_WIDTH : 0);
    return { x: x + 35, y: isTop ? BOARD_PADDING : CANVAS_HEIGHT - BOARD_PADDING, isTop };
  }, []);

  const getZone = useCallback((x: number, y: number, isRed: boolean, isFlipped: boolean) => {
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50;
    // Zona de salida SIEMPRE a la izquierda (x < xBase)
    if (x < xBase - 10) return { type: 'off' };
    
    for (let i = 0; i < 24; i++) {
      const pos = getPos(i, isRed, isFlipped);
      if (Math.abs(x - pos.x) < 35) {
        if (pos.isTop && y < CANVAS_HEIGHT / 2) return { type: 'point', index: i };
        if (!pos.isTop && y > CANVAS_HEIGHT / 2) return { type: 'point', index: i };
      }
    }
    if (Math.abs(x - (xBase + 450)) < 30) return { type: 'bar' };
    return null;
  }, [getPos]);

  useEffect(() => {
    if (view !== 'PLAYING') return;
    const ctx = canvasRef.current?.getContext('2d');
    let anim: number;

    const render = () => {
      if (!ctx) return;
      const s = stateRef.current;
      const isRed = s.userColor === 'red';

      // Estabilización AR
      if (rawHand.current.isDetected) {
        smoothHand.current.x += (rawHand.current.x - smoothHand.current.x) * 0.4;
        smoothHand.current.y += (rawHand.current.y - smoothHand.current.y) * 0.4;
        if (rawHand.current.isPinching) pinchBuffer.current++; else pinchBuffer.current = 0;

        const stabilizedPinch = pinchBuffer.current >= AR_STABILIZATION_THRESHOLD;
        if (stabilizedPinch && !grabbedRef.current && (s.gameMode === 'LOCAL' || s.turn === s.userColor)) {
          const zone = getZone(smoothHand.current.x, smoothHand.current.y, isRed, s.isFlipped);
          if (zone?.type === 'bar' && s.bar[s.turn] > 0) {
            grabbedRef.current = { player: s.turn, fromIndex: -1, x: smoothHand.current.x, y: smoothHand.current.y, isMouse: false, offsetY: 0 };
          } else if (zone?.type === 'point' && s.points[zone.index!].checkers.includes(s.turn)) {
            grabbedRef.current = { player: s.turn, fromIndex: zone.index!, x: smoothHand.current.x, y: smoothHand.current.y, isMouse: false, offsetY: 0 };
          }
        } else if (!rawHand.current.isPinching && grabbedRef.current && !grabbedRef.current.isMouse) {
          const zone = getZone(smoothHand.current.x, smoothHand.current.y, isRed, s.isFlipped);
          if (zone) {
            const to = zone.type === 'off' ? 'off' : (zone.type === 'point' ? zone.index! : null);
            if (to !== null) {
              const die = s.movesLeft.find(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, to as any, d));
              if (die) executeMove(grabbedRef.current!.fromIndex, to as any, die);
            }
          }
          grabbedRef.current = null;
        }
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const xB = (CANVAS_WIDTH - 900) / 2 + 50;

      // Tablero
      ctx.save(); ctx.globalAlpha = s.boardOpacity; ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, 900, CANVAS_HEIGHT - BOARD_PADDING * 2); ctx.restore();

      // Puntos y Fichas
      for (let i = 0; i < 24; i++) {
        const pos = getPos(i, isRed, s.isFlipped);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.9)' : 'rgba(190, 160, 110, 0.7)';
        ctx.beginPath(); ctx.moveTo(pos.x - 35, pos.y); ctx.lineTo(pos.x + 35, pos.y); ctx.lineTo(pos.x, pos.isTop ? pos.y + 260 : pos.y - 260); ctx.fill();
        s.points[i].checkers.forEach((p, idx) => {
          if (grabbedRef.current?.fromIndex === i && idx === s.points[i].checkers.length - 1) return;
          drawChecker(ctx, pos.x, pos.isTop ? pos.y + 40 + idx * 42 : pos.y - 40 - idx * 42, p);
        });
      }

      // Barra Central
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(xB + 450 - 30, BOARD_PADDING, 60, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const count = s.bar[p as Player];
        const baseV = p === 'white' ? CANVAS_HEIGHT - 120 : 120;
        for (let i = 0; i < count; i++) {
          if (grabbedRef.current?.fromIndex === -1 && grabbedRef.current?.player === p && i === count - 1) continue;
          drawChecker(ctx, xB + 450, baseV + (p === 'white' ? -i * 42 : i * 42), p as Player);
        }
      });

      // ZONA SALIDA (Bear-off) -> Siempre a la izquierda
      const OFF_X = 60;
      for(let i=0; i<s.off.white; i++) drawChecker(ctx, OFF_X, CANVAS_HEIGHT - 80 - i*15, 'white', true);
      for(let i=0; i<s.off.red; i++) drawChecker(ctx, OFF_X, 80 + i*15, 'red', true);

      // Dados
      if (s.dice.length) s.dice.forEach((d, i) => drawDie(ctx, xB + 450 + (i === 0 ? -180 : 180), CANVAS_HEIGHT/2, d, s.turn));

      // Ficha arrastrada
      if (grabbedRef.current) {
        const dx = grabbedRef.current.isMouse ? mousePos.current.x : smoothHand.current.x;
        const dy = grabbedRef.current.isMouse ? mousePos.current.y : smoothHand.current.y;
        drawChecker(ctx, dx, dy + grabbedRef.current.offsetY, grabbedRef.current.player, false, true);
      }

      // Cursor AR
      if (rawHand.current.isDetected) {
        ctx.beginPath(); ctx.arc(smoothHand.current.x, smoothHand.current.y, rawHand.current.isPinching ? 10 : 20, 0, Math.PI * 2);
        ctx.strokeStyle = rawHand.current.isPinching ? COLORS.gold : '#fff'; ctx.lineWidth = 3; ctx.stroke();
      }

      anim = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(anim);
  }, [view, getPos, getZone]);

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, p: Player, flat = false, glow = false) => {
    ctx.save();
    if (glow) { ctx.shadowBlur = 30; ctx.shadowColor = COLORS.gold; }
    const gr = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, CHECKER_RADIUS);
    gr.addColorStop(0, p === 'white' ? '#fff' : '#f55');
    gr.addColorStop(1, p === 'white' ? '#aaa' : '#900');
    ctx.beginPath(); ctx.arc(x, y, flat ? CHECKER_RADIUS / 1.5 : CHECKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = gr; ctx.fill(); ctx.restore();
  };

  const drawDie = (ctx: CanvasRenderingContext2D, x: number, y: number, v: number, p: Player) => {
    ctx.fillStyle = p === 'white' ? '#fff' : '#f44';
    ctx.beginPath(); (ctx as any).roundRect?.(x - 35, y - 35, 70, 70, 12); ctx.fill();
    ctx.fillStyle = p === 'white' ? '#000' : '#fff';
    const dots: Record<number, number[][]> = { 1:[[0,0]], 2:[[-18,-18],[18,18]], 3:[[-18,-18],[0,0],[18,18]], 4:[[-18,-18],[18,-18],[-18,18],[18,18]], 5:[[-18,-18],[18,-18],[0,0],[-18,18],[18,18]], 6:[[-18,-18],[18,-18],[-18,0],[18,0],[-18,18],[18,18]] };
    dots[v]?.forEach(d => { ctx.beginPath(); ctx.arc(x+d[0], y+d[1], 6, 0, Math.PI*2); ctx.fill(); });
  };

  const rollDice = useCallback(() => {
    const s = stateRef.current;
    if (s.movesLeft.length > 0 || s.winner || (s.gameMode !== 'LOCAL' && s.turn !== s.userColor)) return;
    playSound('dice');
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    const ns = { ...s, dice: [d1, d2], movesLeft: moves, isBlocked: !hasAnyLegalMove({ ...s, movesLeft: moves } as any) };
    setState(ns); broadcastState(ns);
  }, [broadcastState]);

  return (
    <div className="w-full h-full bg-black relative flex flex-col overflow-hidden"
      onPointerDown={(e) => {
        if (view !== 'PLAYING' || isMenuOpen) return;
        const { x, y } = { x: (e.clientX / window.innerWidth) * CANVAS_WIDTH, y: (e.clientY / window.innerHeight) * CANVAS_HEIGHT };
        const zone = getZone(x, y, stateRef.current.userColor === 'red', stateRef.current.isFlipped);
        if (zone?.type === 'bar' && stateRef.current.bar[stateRef.current.turn] > 0) {
          grabbedRef.current = { player: stateRef.current.turn, fromIndex: -1, x, y, isMouse: true, offsetY: -40 };
        } else if (zone?.type === 'point' && stateRef.current.points[zone.index!].checkers.includes(stateRef.current.turn)) {
          grabbedRef.current = { player: stateRef.current.turn, fromIndex: zone.index!, x, y, isMouse: true, offsetY: -40 };
        }
      }}
      onPointerUp={(e) => {
        if (!grabbedRef.current?.isMouse) return;
        const { x, y } = { x: (e.clientX / window.innerWidth) * CANVAS_WIDTH, y: (e.clientY / window.innerHeight) * CANVAS_HEIGHT };
        const zone = getZone(x, y, stateRef.current.userColor === 'red', stateRef.current.isFlipped);
        if (zone) {
          const to = zone.type === 'off' ? 'off' : (zone.type === 'point' ? zone.index! : null);
          if (to !== null) {
            const die = stateRef.current.movesLeft.find(d => isValidMove(stateRef.current, stateRef.current.turn, grabbedRef.current!.fromIndex, to as any, d));
            if (die) executeMove(grabbedRef.current!.fromIndex, to as any, die);
          }
        }
        grabbedRef.current = null;
      }}
      onPointerMove={(e) => {
        mousePos.current = { x: (e.clientX / window.innerWidth) * CANVAS_WIDTH, y: (e.clientY / window.innerHeight) * CANVAS_HEIGHT };
      }}
    >
      {view === 'HOME' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-8">
          <h1 className="text-8xl font-black italic text-white mb-16 tracking-tighter shadow-glow">B-GAMMON</h1>
          <div className="flex flex-col gap-4 w-72">
            <button onClick={() => { setState(s => ({ ...s, gameMode: 'AI' })); setView('PLAYING'); }} className="bg-white text-black font-black py-5 rounded-2xl hover:bg-yellow-600 hover:text-white transition-all uppercase">Vs Máquina</button>
            <button onClick={() => setView('ONLINE_LOBBY')} className="bg-stone-800 text-white font-black py-5 rounded-2xl hover:bg-stone-700 transition-all uppercase">Multijugador</button>
            <button onClick={() => { setState(s => ({ ...s, gameMode: 'LOCAL' })); setView('PLAYING'); }} className="bg-stone-900 text-white/50 font-black py-5 rounded-2xl text-[10px] uppercase">Local (2 Jugadores)</button>
          </div>
        </div>
      )}

      {view === 'ONLINE_LOBBY' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-8">
          <h2 className="text-5xl font-black text-white mb-12 italic uppercase">Sala Online</h2>
          <div className="bg-stone-900 p-10 rounded-[3rem] w-full max-w-md border border-white/5 space-y-6">
            <button onClick={() => { 
              const rid = Math.random().toString(36).substring(7).toUpperCase();
              setState(s => ({ ...s, roomID: rid, userColor: 'white', isHost: true, gameMode: 'ONLINE' }));
              initPeer(rid, true);
              setView('INVITE_SENT');
            }} className="w-full bg-yellow-600 text-black font-black py-6 rounded-2xl uppercase shadow-xl">Crear Nueva Sala</button>
          </div>
          <button onClick={() => setView('HOME')} className="mt-8 text-white/30 uppercase font-black text-xs hover:text-white">Atrás</button>
        </div>
      )}

      {view === 'INVITE_SENT' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-8">
          <div className="bg-stone-900 p-12 rounded-[4rem] w-full max-w-lg border border-white/5 text-center space-y-8">
            <h3 className="text-3xl font-black text-white italic">¡SALA CREADA!</h3>
            <div className="bg-black/50 p-6 rounded-2xl font-mono text-yellow-600 break-all select-all">
              {`${window.location.origin}${window.location.pathname}?room=${state.roomID}`}
            </div>
            <button onClick={() => { 
              navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.roomID}`);
              setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000);
            }} className={`w-full py-5 rounded-2xl font-black uppercase transition-all ${copyFeedback ? 'bg-green-600' : 'bg-white text-black'}`}>
              {copyFeedback ? '¡COPIADO!' : 'COPIAR LINK'}
            </button>
            <div className="flex items-center justify-center gap-3 text-white/20 animate-pulse">
              <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
              <span className="text-[10px] font-black uppercase tracking-widest">Esperando rival... ({state.connStatus})</span>
            </div>
          </div>
          <button onClick={() => setView('HOME')} className="mt-8 text-white/30 uppercase text-xs">Cancelar</button>
        </div>
      )}

      {(view === 'CONNECTING') && (
        <div className="absolute inset-0 z-[200] bg-stone-950 flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-white font-black uppercase tracking-widest text-sm animate-pulse">Estableciendo conexión segura...</p>
          <p className="text-white/20 text-[10px] mt-2 font-black uppercase">{state.connStatus}</p>
        </div>
      )}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-md safe-top">
            <button onClick={() => setIsMenuOpen(true)} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1">
              <div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div>
            </button>
            <div className="flex gap-4 items-center">
              <div className={`px-8 py-2.5 rounded-full font-black text-[11px] uppercase border-2 ${(state.turn === state.userColor || state.gameMode === 'LOCAL') ? 'bg-yellow-600 text-black border-yellow-600' : 'text-white/30 border-white/10'}`}>
                {state.gameMode === 'LOCAL' ? `Turno: ${state.turn.toUpperCase()}` : (state.turn === state.userColor ? 'Tu Turno' : 'Esperando...')}
              </div>
              <button onClick={rollDice} disabled={state.movesLeft.length > 0 || (state.gameMode === 'ONLINE' && state.turn !== state.userColor)} className="bg-white text-black font-black px-8 py-2.5 rounded-full text-[11px] uppercase shadow-2xl disabled:opacity-20 hover:scale-105 active:scale-95 transition-all">Lanzar</button>
            </div>
          </header>
          <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-20 w-full h-full object-contain pointer-events-none" />
            {isARLoading && <div className="absolute inset-0 bg-stone-950/80 z-50 flex items-center justify-center text-white/50 font-black uppercase italic tracking-widest text-xs animate-pulse">Iniciando AR...</div>}
          </main>
          {isMenuOpen && (
            <div className="absolute inset-0 z-[300] bg-black/60 backdrop-blur-sm flex justify-start animate-in fade-in duration-300" onClick={() => setIsMenuOpen(false)}>
              <div className="w-80 bg-stone-900 h-full p-8 flex flex-col gap-10" onClick={e => e.stopPropagation()}>
                <h3 className="text-2xl font-black italic border-b border-white/5 pb-4">OPCIONES</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-40">Opacidad Tablero</label>
                    <input type="range" min="0" max="1" step="0.1" value={state.boardOpacity} onChange={e => setState(s => ({ ...s, boardOpacity: parseFloat(e.target.value) }))} className="w-full accent-yellow-600" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase opacity-40">Opacidad Cámara</label>
                    <input type="range" min="0" max="1" step="0.1" value={state.cameraOpacity} onChange={e => setState(s => ({ ...s, cameraOpacity: parseFloat(e.target.value) }))} className="w-full accent-yellow-600" />
                  </div>
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <button onClick={() => { setView('HOME'); setIsMenuOpen(false); if (peerRef.current) peerRef.current.destroy(); }} className="bg-red-600/10 text-red-500 font-black py-4 rounded-xl uppercase text-xs border border-red-500/20">Salir de la partida</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
