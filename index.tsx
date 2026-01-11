
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- SILENCIADOR DE ERRORES (Gemi Julie Clean Logs) ---
window.addEventListener('error', (e) => {
  const ignored = [
    'WebSocket', 'message channel closed', 'favicon.ico', 
    'refresh.js', 'NotReadableError', 'NotAllowedError', 
    'AbortError', 'NS_ERROR_CORRUPTED_CONTENT', 'PeerJS', 'Could not start video source'
  ];
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
    if (type === 'dice') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      source.connect(gain); gain.connect(ctx.destination);
      source.start();
    } else if (type === 'checker') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'win') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    }
  } catch(e) {}
};

// --- TYPES ---
export type Player = 'white' | 'red';
export type View = 'HOME' | 'ONLINE_LOBBY' | 'INVITE_SENT' | 'PLAYING' | 'CONNECTING';
export type GameMode = 'AI' | 'ONLINE' | 'LOCAL';
export interface Point { checkers: Player[]; }
export interface GrabbedInfo { player: Player; fromIndex: number; x: number; y: number; isMouse: boolean; offsetY: number; }
export interface GameStateSnapshot {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  movesLeft: number[];
}
export interface GameState {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  turn: Player;
  dice: number[];
  movesLeft: number[];
  grabbed: GrabbedInfo | null;
  winner: Player | null;
  gameMode: GameMode;
  userColor: Player;
  roomID: string;
  isHost: boolean;
  boardOpacity: number;
  cameraOpacity: number;
  isBlocked: boolean;
  onlineOpponentConnected: boolean;
  isFlipped: boolean;
}

// --- CONSTANTS ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const CENTER_BAR_WIDTH = 60;
const CHECKER_RADIUS = 26;
const RELATIVE_PINCH_THRESHOLD = 0.5; 
const COLORS = { white: '#ffffff', red: '#ff2222', gold: '#fbbf24' };

const initialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => { for(let i=0; i<n; i++) p[idx].checkers.push(col); };
  add(0, 2, 'red'); add(11, 5, 'red'); add(16, 3, 'red'); add(18, 5, 'red');
  add(23, 2, 'white'); add(12, 5, 'white'); add(7, 3, 'white'); add(5, 5, 'white');
  return p;
};

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
        if (target >= 0 && target <= 23) return isValidMove(state, p, i, target, die);
        return isValidMove(state, p, i, 'off', die);
      })) return true;
    }
  }
  return false;
};

const ConfettiRain: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[140]">
      {Array.from({ length: 60 }).map((_, i) => (
        <div 
          key={i} 
          className="confetti" 
          style={{ 
            left: `${Math.random() * 100}%`, 
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${3 + Math.random() * 2}s`,
            backgroundColor: i % 3 === 0 ? '#fbbf24' : (i % 3 === 1 ? '#ffffff' : '#f59e0b'),
            width: `${Math.random() * 12 + 6}px`,
            height: `${Math.random() * 8 + 4}px`
          }} 
        />
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [history, setHistory] = useState<GameStateSnapshot[]>([]);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const smoothHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  const pinchBuffer = useRef<boolean[]>([]);
  const grabbedRef = useRef<GrabbedInfo | null>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const handshakeInterval = useRef<any>(null);

  const [state, setState] = useState<GameState>({
    points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], grabbed: null,
    winner: null, gameMode: 'LOCAL', userColor: 'white',
    roomID: '', isHost: true, boardOpacity: 0.9, cameraOpacity: 0.35, isBlocked: false,
    onlineOpponentConnected: false, isFlipped: false
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const clearRoomURL = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      window.history.replaceState({}, document.title, url.pathname);
    }
  }, []);

  const broadcastState = useCallback((newState: Partial<GameState>) => {
    if (connRef.current && stateRef.current.gameMode === 'ONLINE' && connRef.current.open) {
        const { grabbed, ...syncData } = newState as any;
        connRef.current.send({ type: 'STATE_SYNC', payload: syncData });
    }
  }, []);

  useEffect(() => {
    if (state.roomID && state.gameMode === 'ONLINE') {
        const peerID = state.isHost ? `bgammon-${state.roomID}-host` : `bgammon-${state.roomID}-guest-${Math.random().toString(36).substring(2, 6)}`;
        if (peerRef.current) peerRef.current.destroy();
        const peer = new (window as any).Peer(peerID, { 
            debug: 0,
            config: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }, { 'urls': 'stun:stun1.l.google.com:19302' }] } 
        });
        peerRef.current = peer;
        peer.on('open', () => { if (!state.isHost) attemptConnection(); });
        const attemptConnection = () => {
            if (!peer.open || stateRef.current.isHost) return;
            const conn = peer.connect(`bgammon-${state.roomID}-host`, { reliable: true });
            setupConnection(conn);
        };
        peer.on('connection', (conn: any) => { if (stateRef.current.isHost) setupConnection(conn); });
        const setupConnection = (conn: any) => {
            connRef.current = conn;
            conn.on('open', () => {
                if (!stateRef.current.isHost) {
                    if (handshakeInterval.current) clearInterval(handshakeInterval.current);
                    handshakeInterval.current = setInterval(() => {
                        if (conn.open) conn.send({ type: 'GUEST_HELLO', payload: { timestamp: Date.now() } });
                    }, 1500);
                    conn.send({ type: 'GUEST_HELLO', payload: { timestamp: Date.now() } });
                }
            });
            conn.on('data', (data: any) => {
                const { type, payload } = data;
                if (type === 'GUEST_HELLO' && stateRef.current.isHost) {
                    setState(s => ({ ...s, onlineOpponentConnected: true }));
                    conn.send({ type: 'HANDSHAKE_ACK', payload: stateRef.current });
                }
                if (type === 'HANDSHAKE_ACK' && !stateRef.current.isHost) {
                    if (handshakeInterval.current) { clearInterval(handshakeInterval.current); handshakeInterval.current = null; }
                    setState(s => ({ ...payload, onlineOpponentConnected: true, isHost: false, userColor: 'red', roomID: s.roomID }));
                    setView('PLAYING');
                }
                if (type === 'STATE_SYNC') {
                    setState(s => ({
                      ...s, ...payload,
                      userColor: s.userColor, isHost: s.isHost, roomID: s.roomID, isFlipped: s.isFlipped,
                      boardOpacity: s.boardOpacity, cameraOpacity: s.cameraOpacity, onlineOpponentConnected: true
                    }));
                }
            });
            conn.on('close', () => setState(s => ({ ...s, onlineOpponentConnected: false })));
            conn.on('error', () => { if (!stateRef.current.isHost) setTimeout(attemptConnection, 3000); });
        };
        return () => { if (handshakeInterval.current) clearInterval(handshakeInterval.current); };
    }
  }, [state.roomID, state.gameMode]);

  useEffect(() => { if (state.isHost && state.onlineOpponentConnected && (view === 'INVITE_SENT' || view === 'ONLINE_LOBBY')) setView('PLAYING'); }, [state.onlineOpponentConnected, view, state.isHost]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && view === 'HOME') {
      setState(s => ({ ...s, roomID: room.toUpperCase(), userColor: 'red', gameMode: 'ONLINE', isHost: false }));
      setView('ONLINE_LOBBY');
    }
  }, []);

  const [isARLoading, setIsARLoading] = useState(true);
  const rawHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, isPinching: false, isDetected: false });

  const resetGame = useCallback((mode: GameMode = 'LOCAL') => {
    setHistory([]); setIsAiProcessing(false); grabbedRef.current = null;
    const newState = { ...stateRef.current, points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 }, turn: 'white', dice: [], movesLeft: [], grabbed: null, winner: null, gameMode: mode, isBlocked: false };
    setState(newState); broadcastState(newState);
  }, [broadcastState]);

  // --- AR LOGIC ---
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let mounted = true; let cameraInstance: any = null;
    const HandsClass = (window as any).Hands; const CameraClass = (window as any).Camera;
    const initAR = async () => {
      if (!HandsClass || !CameraClass || !videoRef.current) { if (mounted) setIsARLoading(false); return; }
      const hands = new HandsClass({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.7 });
      hands.onResults((results: any) => {
        if (!mounted || !results.multiHandLandmarks?.length) { rawHand.current.isDetected = false; return; }
        const l = results.multiHandLandmarks[0];
        const palmSize = Math.sqrt(Math.pow(l[0].x - l[9].x, 2) + Math.pow(l[0].y - l[9].y, 2));
        const pinchDist = Math.sqrt(Math.pow(l[8].x - l[4].x, 2) + Math.pow(l[8].y - l[4].y, 2));
        rawHand.current = { x: (1 - l[8].x) * CANVAS_WIDTH, y: l[8].y * CANVAS_HEIGHT, isPinching: (pinchDist / palmSize) < RELATIVE_PINCH_THRESHOLD, isDetected: true };
      });
      try {
        cameraInstance = new CameraClass(videoRef.current, { onFrame: async () => { if (mounted && videoRef.current) try { await hands.send({ image: videoRef.current }); } catch(e) {} }, width: 1280, height: 720 });
        await cameraInstance.start();
      } catch (err: any) { setCameraError("Cámara ocupada."); if (mounted) setIsARLoading(false); } finally { if (mounted) setIsARLoading(false); }
    };
    initAR(); return () => { mounted = false; if (cameraInstance) try { cameraInstance.stop(); } catch(e) {} };
  }, [view]);

  const rollDice = useCallback((forced: boolean = false) => {
    const s = stateRef.current; if (!(s.gameMode === 'LOCAL' || s.turn === s.userColor) && !forced) return;
    playSound('dice'); setHistory([]);
    setState(s => {
      if (!forced && (s.movesLeft.length > 0 || s.winner)) return s;
      const d1 = Math.floor(Math.random() * 6) + 1; const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      const result = { ...s, dice: [d1, d2], movesLeft: moves, isBlocked: !hasAnyLegalMove({ ...s, dice: [d1, d2], movesLeft: moves } as any) && !s.winner };
      broadcastState(result); return result;
    });
  }, [broadcastState]);

  const passTurn = useCallback(() => {
    setHistory([]); setIsAiProcessing(false);
    setState(s => {
      const result = { ...s, turn: (s.turn === 'white' ? 'red' : 'white') as Player, dice: [], movesLeft: [], isBlocked: false };
      broadcastState(result); return result;
    });
  }, [broadcastState]);

  const undoMove = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1]; setHistory(h => h.slice(0, -1));
    setState(s => { const result = { ...s, ...last, isBlocked: false }; broadcastState(result); return result; });
  };

  const executeMove = (from: number, to: number | 'off', die: number) => {
    const current = stateRef.current; if (!isValidMove(current, current.turn, from, to, die)) return;
    playSound('checker');
    setHistory(h => [...h, { points: JSON.parse(JSON.stringify(current.points)), bar: { ...current.bar }, off: { ...current.off }, movesLeft: [...current.movesLeft] }]);
    setState(curr => {
      const ns = JSON.parse(JSON.stringify(curr)) as GameState; const p = ns.turn;
      if (from === -1) ns.bar[p]--; else ns.points[from].checkers.pop();
      if (to === 'off') ns.off[p]++;
      else {
        const target = ns.points[to as number];
        if (target.checkers.length === 1 && target.checkers[0] !== p) { ns.bar[target.checkers[0]]++; target.checkers = [p]; }
        else target.checkers.push(p);
      }
      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      if (ns.off.white === 15) { ns.winner = 'white'; playSound('win'); } else if (ns.off.red === 15) { ns.winner = 'red'; playSound('win'); }
      if (ns.winner) { ns.isBlocked = false; ns.movesLeft = []; }
      else {
        if (ns.movesLeft.length > 0 && !hasAnyLegalMove(ns)) ns.isBlocked = true;
        else if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; ns.movesLeft = []; ns.isBlocked = false; setHistory([]); }
      }
      broadcastState(ns); return ns;
    });
  };

  const getPos = useCallback((idx: number, isUserRed: boolean, isFlipped: boolean) => {
    let effectiveIdx = isUserRed ? 23 - idx : idx;
    if (isFlipped) effectiveIdx = 23 - effectiveIdx; 
    const isTop = effectiveIdx >= 12;
    const relIdx = isTop ? 23 - effectiveIdx : effectiveIdx;
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50; 
    const x = xBase + (relIdx * 70) + (relIdx >= 6 ? CENTER_BAR_WIDTH : 0);
    return { x: x + 35, y: isTop ? BOARD_PADDING : CANVAS_HEIGHT - BOARD_PADDING, isTop };
  }, []);

  const getZone = useCallback((x: number, y: number, isUserRed: boolean, isFlipped: boolean) => {
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50;
    
    // PRIORIDAD 1: Puntos internos (6, 7, 18, 19) y todos los demás puntos
    // Se revisan antes que la barra para evitar colisiones en los bordes internos
    for (let i = 0; i < 24; i++) {
      const pos = getPos(i, isUserRed, isFlipped);
      // Hitbox optimizado: 35px de ancho (un punto completo) + margen de error de 5px
      if (Math.abs(x - pos.x) < 40) {
        // Hitbox vertical amplio para facilitar el soltado en tablets/móviles
        if (pos.isTop && y < CANVAS_HEIGHT/2 + 80) return { type: 'point', index: i };
        if (!pos.isTop && y > CANVAS_HEIGHT/2 - 80) return { type: 'point', index: i };
      }
    }
    
    // PRIORIDAD 2: Barra central (hitbox reducido para no pisar puntos 5, 6, 17, 18)
    if (Math.abs(x - (xBase + 450)) < 40) return { type: 'bar' };
    
    // PRIORIDAD 3: Bear-off (Retirada de fichas) - Siempre a la izquierda o margen exterior
    if (x < xBase - 10 || x > xBase + 910) return { type: 'off' };
    
    return null;
  }, [getPos]);

  const getClampedCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 };
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT; const rectAspect = rect.width / rect.height;
    let scale, ox, oy;
    if (rectAspect > canvasAspect) { scale = rect.height / CANVAS_HEIGHT; ox = (rect.width - CANVAS_WIDTH * scale) / 2; oy = 0; }
    else { scale = rect.width / CANVAS_WIDTH; ox = 0; oy = (rect.height - CANVAS_HEIGHT * scale) / 2; }
    return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    if (isMenuOpen || stateRef.current.winner) return;
    const s = stateRef.current; if (!(s.gameMode === 'LOCAL' || s.turn === s.userColor)) return;
    const { x, y } = getClampedCoords(clientX, clientY);
    const zone = getZone(x, y, s.userColor === 'red', s.isFlipped);
    
    if (zone?.type === 'bar' && s.bar[s.turn] > 0) {
      grabbedRef.current = { player: s.turn, fromIndex: -1, x, y, isMouse: true, offsetY: 0 };
      setState(p => ({ ...p, grabbed: grabbedRef.current }));
    } else if (zone?.type === 'point' && s.points[zone.index!].checkers.includes(s.turn)) {
      // OffsetY mejorado: la ficha "flota" ligeramente sobre el dedo en pantallas táctiles
      grabbedRef.current = { player: s.turn, fromIndex: zone.index!, x, y, isMouse: true, offsetY: -40 };
      setState(p => ({ ...p, grabbed: grabbedRef.current }));
    }
  };

  const handlePointerUp = (clientX: number, clientY: number) => {
    if (!grabbedRef.current || !grabbedRef.current.isMouse) return;
    const s = stateRef.current; const { x, y } = getClampedCoords(clientX, clientY);
    const tz = getZone(x, y, s.userColor === 'red', s.isFlipped);
    if (tz) {
      const to = tz.type === 'off' ? 'off' : (tz.type === 'point' ? tz.index! : null);
      if (to !== null) {
        const possibleDice = s.movesLeft.filter(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, to as any, d));
        if (possibleDice.length > 0) executeMove(grabbedRef.current!.fromIndex, to as any, possibleDice[0]);
      }
    }
    grabbedRef.current = null; setState(p => ({ ...p, grabbed: null }));
  };

  useEffect(() => {
    if (view !== 'PLAYING') return;
    let anim: number;
    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      const s = stateRef.current; const isRed = s.userColor === 'red';
      
      if (rawHand.current.isDetected) {
        smoothHand.current.x += (rawHand.current.x - smoothHand.current.x) * 0.5;
        smoothHand.current.y += (rawHand.current.y - smoothHand.current.y) * 0.5;
        pinchBuffer.current.push(rawHand.current.isPinching); if (pinchBuffer.current.length > 5) pinchBuffer.current.shift();
        const isPinchS = pinchBuffer.current.filter(b => b).length >= 3;
        const isRelS = pinchBuffer.current.filter(b => !b).length >= 3;
        if (isPinchS && !grabbedRef.current && (s.gameMode === 'LOCAL' || s.turn === s.userColor) && !s.winner && !s.isBlocked && !isMenuOpen) {
          const zone = getZone(smoothHand.current.x, smoothHand.current.y, isRed, s.isFlipped);
          if (zone?.type === 'bar' && s.bar[s.turn] > 0) { grabbedRef.current = { player: s.turn, fromIndex: -1, x: smoothHand.current.x, y: smoothHand.current.y, isMouse: false, offsetY: 0 }; setState(p => ({ ...p, grabbed: grabbedRef.current })); }
          else if (zone?.type === 'point' && s.points[zone.index!].checkers.includes(s.turn)) { grabbedRef.current = { player: s.turn, fromIndex: zone.index!, x: smoothHand.current.x, y: smoothHand.current.y, isMouse: false, offsetY: 0 }; setState(p => ({ ...p, grabbed: grabbedRef.current })); }
        } else if (isRelS && grabbedRef.current && !grabbedRef.current.isMouse) {
          const tz = getZone(smoothHand.current.x, smoothHand.current.y, isRed, s.isFlipped);
          if (tz) { const to = tz.type === 'off' ? 'off' : (tz.type === 'point' ? tz.index! : null); if (to !== null) { const possibleDice = s.movesLeft.filter(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, to as any, d)); if (possibleDice.length > 0) executeMove(grabbedRef.current!.fromIndex, to as any, possibleDice[0]); } }
          grabbedRef.current = null; setState(p => ({ ...p, grabbed: null }));
        }
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const xB = (CANVAS_WIDTH - 900) / 2 + 50;
      ctx.save(); ctx.globalAlpha = s.boardOpacity; ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, 900, CANVAS_HEIGHT - BOARD_PADDING * 2); ctx.restore();

      for (let i = 0; i < 24; i++) {
        const pos = getPos(i, isRed, s.isFlipped);
        const canM = (s.gameMode === 'LOCAL' || s.turn === s.userColor) && s.movesLeft.length > 0 && s.points[i].checkers.includes(s.turn);
        const isT = grabbedRef.current && s.movesLeft.some(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, i, d));
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.95)' : 'rgba(190, 160, 110, 0.8)';
        if (isT) ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
        ctx.beginPath(); ctx.moveTo(pos.x - 35, pos.y); ctx.lineTo(pos.x + 35, pos.y); ctx.lineTo(pos.x, pos.isTop ? pos.y + 280 : pos.y - 280); ctx.fill();
        s.points[i].checkers.forEach((p, idx) => { if (grabbedRef.current?.fromIndex === i && idx === s.points[i].checkers.length - 1) return; drawCh(ctx, pos.x, pos.isTop ? pos.y + 42 + idx * 42 : pos.y - 42 - idx * 42, p, false, canM && idx === s.points[i].checkers.length - 1); });
      }

      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(xB + 450 - 32, BOARD_PADDING, 64, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const c = s.bar[p as Player];
        const vY = (p === 'white' ? (!isRed ? CANVAS_HEIGHT - 120 : 120) : (!isRed ? 120 : CANVAS_HEIGHT - 120));
        const canMB = (s.gameMode === 'LOCAL' || s.turn === s.userColor) && s.movesLeft.length > 0 && p === s.turn;
        for(let i=0; i<c; i++) { if (grabbedRef.current?.fromIndex === -1 && grabbedRef.current?.player === p && i === c - 1) continue; drawCh(ctx, xB + 450, vY + (p === (isRed ? 'red' : 'white') ? -i*42 : i*42), p as Player, false, canMB && i === c - 1); }
      });

      const OFF_X = 80;
      for(let i=0; i<s.off.white; i++) {
        const isBottom = !isRed; drawCh(ctx, OFF_X, isBottom ? CANVAS_HEIGHT - BOARD_PADDING - 40 - i*15 : BOARD_PADDING + 40 + i*15, 'white');
      }
      for(let i=0; i<s.off.red; i++) {
        const isBottom = isRed; drawCh(ctx, OFF_X, isBottom ? CANVAS_HEIGHT - BOARD_PADDING - 40 - i*15 : BOARD_PADDING + 40 + i*15, 'red');
      }
      
      if (s.dice.length > 0) s.dice.forEach((d, i) => drawD(ctx, xB + 450 + (i === 0 ? -180 : 180), CANVAS_HEIGHT/2, d, s.turn));
      const dX = (grabbedRef.current?.isMouse ? mousePos.current.x : smoothHand.current.x);
      const dY = (grabbedRef.current?.isMouse ? mousePos.current.y : smoothHand.current.y) + (grabbedRef.current?.offsetY || 0);
      if (grabbedRef.current) drawCh(ctx, dX, dY, grabbedRef.current.player, true);
      if (rawHand.current.isDetected) { ctx.beginPath(); ctx.arc(smoothHand.current.x, smoothHand.current.y, rawHand.current.isPinching ? 12 : 24, 0, Math.PI * 2); ctx.strokeStyle = rawHand.current.isPinching ? COLORS.gold : 'white'; ctx.lineWidth = 4; ctx.stroke(); }
      anim = requestAnimationFrame(draw);
    };
    anim = requestAnimationFrame(draw); return () => cancelAnimationFrame(anim);
  }, [view, getPos, getZone, isMenuOpen]);

  const drawCh = (ctx: CanvasRenderingContext2D, x: number, y: number, p: Player, g = false, pulse = false) => {
    ctx.save(); if (g) { ctx.shadowBlur = 40; ctx.shadowColor = COLORS.gold; } else if (pulse) { ctx.shadowBlur = Math.max(0, 15 + Math.sin(Date.now() / 200) * 10); ctx.shadowColor = COLORS.gold; }
    const gr = ctx.createRadialGradient(x - 8, y - 8, 2, x, y, CHECKER_RADIUS); if (p === 'white') { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#ccc'); } else { gr.addColorStop(0, '#f55'); gr.addColorStop(1, '#a00'); }
    ctx.beginPath(); ctx.arc(x, y, CHECKER_RADIUS, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
  };

  const drawD = (ctx: CanvasRenderingContext2D, x: number, y: number, v: number, p: Player) => {
    ctx.save(); ctx.fillStyle = p === 'white' ? '#fff' : '#f44'; ctx.beginPath(); if (typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(x - 40, y - 40, 80, 80, 15); else ctx.rect(x - 40, y - 40, 80, 80); ctx.fill();
    ctx.fillStyle = p === 'white' ? '#000' : '#fff'; const ds: Record<number, number[][]> = { 1: [[0,0]], 2: [[-22,-22], [22,22]], 3: [[-22,-22], [0,0], [22,22]], 4: [[-22,-22], [22,-22], [-22,22], [22,22]], 5: [[-22,-22], [22,-22], [0,0], [-22,22], [22,22]], 6: [[-22,-22], [22,-22], [-22,0], [22,0], [-22,22], [22,22]] };
    (ds[v] || []).forEach((pt: number[]) => { ctx.beginPath(); ctx.arc(x + pt[0], y + pt[1], 7, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
  };

  // IA Logic
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn !== state.userColor && !state.winner && view === 'PLAYING' && !isAiProcessing) {
      setIsAiProcessing(true);
      const runAILogic = async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 1500));
        let current = stateRef.current; if (current.dice.length === 0) { rollDice(true); setIsAiProcessing(false); return; }
        const p = current.turn; const dU = Array.from(new Set<number>(current.movesLeft)).sort((a,b)=>b-a); let mF = false;
        for (const d of dU) {
          if (current.bar[p] > 0) { const target = getTargetPoint(p, -1, d); if (isValidMove(current, p, -1, target, d)) { executeMove(-1, target, d); mF = true; break; } }
          else {
            const ord = p === 'red' ? Array.from({length:24},(_,i)=>i) : Array.from({length:24},(_,i)=>23-i);
            for (let idx of ord) { if (current.points[idx].checkers.includes(p)) { const target = getTargetPoint(p, idx, d); if (target < 0 || target > 23) { if (isValidMove(current, p, idx, 'off', d)) { executeMove(idx, 'off', d); mF = true; break; } } else if (isValidMove(current, p, idx, target, d)) { executeMove(idx, target, d); mF = true; break; } } }
          }
          if (mF) break;
        }
        if (!mF) { if (current.movesLeft.length > 0) setState(prev => ({ ...prev, movesLeft: prev.movesLeft.slice(1) })); else passTurn(); }
        setIsAiProcessing(false);
      };
      runAILogic();
    }
  }, [state.turn, state.dice.length, state.movesLeft.length, isAiProcessing, view, state.gameMode, rollDice, passTurn]);

  const generateRoom = () => { const id = Math.random().toString(36).substring(2, 8).toUpperCase(); setState(s => ({ ...s, roomID: id, userColor: 'white', gameMode: 'ONLINE', isHost: true, onlineOpponentConnected: false })); setView('INVITE_SENT'); };
  const copyInviteLink = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.roomID}`).then(() => { setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); });
  const exitGame = () => { if (handshakeInterval.current) clearInterval(handshakeInterval.current); if (connRef.current) try { connRef.current.close(); } catch(e) {} if (peerRef.current) try { peerRef.current.destroy(); } catch(e) {} clearRoomURL(); setHistory([]); setIsAiProcessing(false); setIsMenuOpen(false); grabbedRef.current = null; setState({ points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 }, turn: 'white', dice: [], movesLeft: [], grabbed: null, winner: null, gameMode: 'LOCAL', userColor: 'white', roomID: '', isHost: true, boardOpacity: 0.9, cameraOpacity: 0.35, isBlocked: false, onlineOpponentConnected: false, isFlipped: false }); setView('HOME'); };

  return (
    <div className="w-full h-full bg-black relative flex flex-col overflow-hidden" 
         onPointerDown={(e) => handlePointerDown(e.clientX, e.clientY)}
         onPointerUp={(e) => handlePointerUp(e.clientX, e.clientY)}
         onPointerMove={(e) => { mousePos.current = getClampedCoords(e.clientX, e.clientY); }}>
      
      {cameraError && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-4"><div className="bg-stone-900/90 border border-yellow-600/50 p-4 rounded-2xl text-center shadow-4xl backdrop-blur-md animate-in slide-in-from-top duration-300"><p className="text-white text-[10px] font-black uppercase tracking-widest">{cameraError}</p><button onClick={() => setCameraError(null)} className="mt-2 text-yellow-600 text-[9px] font-black underline uppercase">Entendido</button></div></div>}

      {state.isBlocked && !state.winner && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[900] w-full max-w-lg px-4 pointer-events-none"><div className="bg-stone-900/80 border border-yellow-600/50 p-6 rounded-3xl text-center shadow-4xl backdrop-blur-md animate-in slide-in-from-top duration-500 pointer-events-auto flex items-center justify-between"><div className="text-left"><h3 className="text-yellow-600 font-black text-xl uppercase italic leading-none">SIN SALIDA</h3><p className="text-white/60 text-[9px] font-bold uppercase mt-1">No hay movimientos legales posibles.</p></div><button onClick={(e) => { e.stopPropagation(); passTurn(); }} className="bg-yellow-600 text-black font-black py-3 px-8 rounded-xl text-xs uppercase shadow-xl hover:scale-105 active:scale-95 transition-all">Siguiente Turno</button></div></div>}

      {view === 'HOME' && <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center"><h1 className="text-9xl font-black italic text-white mb-10 tracking-tighter drop-shadow-2xl">B-GAMMON</h1><div className="flex flex-col gap-4 w-64"><button onClick={() => { resetGame('AI'); setView('PLAYING'); }} className="bg-white text-black font-black py-4 rounded-xl hover:bg-yellow-600 hover:text-white transition-all shadow-xl uppercase tracking-widest">Vs Máquina</button><button onClick={() => setView('ONLINE_LOBBY')} className="bg-stone-800 text-white font-black py-4 rounded-xl hover:bg-stone-700 transition-all shadow-xl uppercase tracking-widest">Multijugador</button><button onClick={() => { resetGame('LOCAL'); setView('PLAYING'); }} className="bg-stone-900 text-white/50 font-black py-4 rounded-xl hover:text-white transition-all uppercase text-[10px]">Local (2 Players)</button></div></div>}

      {view === 'ONLINE_LOBBY' && <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-8"><h2 className="text-5xl font-black text-white mb-12 italic uppercase">Sala Online</h2><div className="bg-stone-900 p-10 rounded-[3rem] w-full max-w-md border border-white/10 shadow-2xl space-y-8">{!state.isHost && state.roomID ? <div className="text-center space-y-6"><p className="text-white/60 uppercase font-black text-xs tracking-widest">Has sido invitado a la sala</p><div className="text-5xl font-black text-yellow-600 bg-black/40 py-6 rounded-2xl border border-white/5">{state.roomID}</div><button onClick={() => setView('CONNECTING')} className="w-full bg-yellow-600 text-black font-black py-5 rounded-2xl uppercase shadow-xl hover:scale-105 transition-all pulse-gold">Aceptar Reto</button></div> : <div className="flex flex-col gap-3"><button onClick={generateRoom} className="w-full bg-yellow-600 text-black font-black py-5 rounded-2xl uppercase shadow-xl hover:scale-105 transition-all">Crear Nueva Sala</button><div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div><div className="relative flex justify-center text-[10px]"><span className="bg-stone-900 px-4 text-white/20 font-black uppercase tracking-widest">o usa un código</span></div></div><input id="room-code-input" type="text" placeholder="Código de sala..." className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-white text-center font-bold outline-none focus:border-yellow-600 transition-all uppercase" /><button onClick={() => { const val = (document.getElementById('room-code-input') as HTMLInputElement)?.value; if(val) setState(s => ({ ...s, roomID: val.toUpperCase(), userColor: 'red', gameMode: 'ONLINE', isHost: false })); }} className="w-full bg-white/5 text-white/40 font-black py-4 rounded-2xl uppercase hover:bg-white/10 transition-all">Unirse por Código</button></div>}</div><button onClick={exitGame} className="mt-10 text-white/30 font-black uppercase text-xs hover:text-white transition-all">Volver</button></div>}

      {view === 'CONNECTING' && <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center p-8"><div className="w-16 h-16 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mb-8"></div><p className="text-white font-black uppercase tracking-widest text-sm animate-pulse">Estableciendo conexión segura...</p><button onClick={exitGame} className="mt-12 text-white/30 text-[10px] uppercase underline">Cancelar</button></div>}

      {view === 'INVITE_SENT' && <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-8"><div className="bg-stone-900 p-12 rounded-[4rem] w-full max-w-lg border border-white/10 shadow-4xl text-center space-y-10"><div className="w-24 h-24 bg-yellow-600/10 rounded-full flex items-center justify-center mx-auto animate-bounce"><span className="text-4xl">🔗</span></div><div><h3 className="text-3xl font-black text-white italic uppercase mb-2">¡SALA CREADA!</h3><p className="text-white/40 text-xs font-black uppercase tracking-widest px-8 leading-relaxed">Envía el link a tu oponente.</p></div><div className="space-y-4"><div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-yellow-600 font-mono font-bold text-xl break-all">{`${window.location.origin}${window.location.pathname}?room=${state.roomID}`}</div><button onClick={copyInviteLink} className={`w-full py-5 rounded-2xl font-black uppercase transition-all shadow-xl ${copyFeedback ? 'bg-green-600 text-white' : 'bg-white text-black hover:bg-yellow-600 hover:text-white'}`}>{copyFeedback ? '¡LINK COPIADO!' : 'COPIAR LINK DE INVITACIÓN'}</button></div><div className="pt-4 flex flex-col items-center">{state.onlineOpponentConnected ? <div className="animate-in fade-in duration-500"><div className="text-green-500 font-black uppercase tracking-widest text-sm">¡RIVAL CONECTADO!</div><div className="text-white/40 text-[9px] font-bold animate-pulse uppercase mt-2">Sincronizando tablero...</div></div> : <div className="flex items-center gap-3 text-white/20 animate-pulse"><div className="w-2 h-2 bg-yellow-600 rounded-full"></div><span className="text-[10px] font-black uppercase tracking-widest">Esperando rival...</span></div>}</div></div><button onClick={exitGame} className="mt-10 text-white/30 font-black uppercase text-xs hover:text-white transition-all">Cancelar</button></div>}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-md safe-top"><button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(true); }} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-inner active:scale-95 transition-all"><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div></button><div className="flex gap-4 items-center">{((state.gameMode === 'LOCAL') || (state.turn === state.userColor)) && history.length > 0 && <button onClick={(e) => { e.stopPropagation(); undoMove(); }} className="bg-white/10 text-white font-black px-6 py-2.5 rounded-full text-[10px] uppercase border border-white/10 hover:bg-white/20">Deshacer</button>}<div className={`px-8 py-2.5 rounded-full font-black text-[11px] uppercase border-2 shadow-2xl transition-all ${(state.gameMode === 'LOCAL' || state.turn === state.userColor) ? 'bg-yellow-600 text-black border-yellow-600' : 'text-white/30 border-white/10'}`}>{state.gameMode === 'LOCAL' ? `TURNO: ${state.turn.toUpperCase()}` : (state.turn === state.userColor ? 'TU TURNO' : (state.gameMode === 'AI' ? 'IA PENSANDO...' : 'ESPERANDO...'))}</div><button onClick={(e) => { e.stopPropagation(); rollDice(); }} disabled={state.movesLeft.length > 0 || (state.gameMode !== 'LOCAL' && state.turn !== state.userColor) || !!state.winner} className={`bg-white text-black font-black px-8 py-2.5 rounded-full text-[11px] disabled:opacity-20 uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all ${(state.movesLeft.length === 0 && (state.gameMode === 'LOCAL' || state.turn === state.userColor)) ? 'pulse-gold shadow-glow' : ''}`}>Lanzar</button></div></header>
          <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">{isARLoading && <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center"><div className="text-white/60 uppercase font-black text-xs italic tracking-widest animate-pulse mb-4">Iniciando AR...</div><button onClick={() => setIsARLoading(false)} className="text-[10px] text-white/30 hover:text-white underline uppercase">Omitir y jugar manual</button></div>}<video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-contain grayscale scale-x-[-1]" autoPlay playsInline muted /><canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-20 w-full h-full object-contain pointer-events-none" />{state.winner && <div className="absolute inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center backdrop-blur-2xl animate-in fade-in duration-700"><ConfettiRain /><div className="text-center z-[210] p-12 bg-stone-900/40 border border-white/5 rounded-[4rem] shadow-4xl animate-in zoom-in duration-500 delay-200"><h2 className="text-3xl font-black text-yellow-600 uppercase tracking-widest mb-2 italic">¡Felicidades!</h2><h1 className="text-9xl font-black italic text-white uppercase mb-4 tracking-tighter">{state.winner === 'white' ? 'BLANCAS' : 'ROJAS'}</h1><p className="text-white/40 font-black uppercase tracking-widest text-xs mb-12 italic">Victoria</p><div className="flex flex-col gap-4 w-80 mx-auto"><button onClick={(e) => { e.stopPropagation(); resetGame(state.gameMode); }} className="bg-yellow-600 text-black font-black py-6 rounded-3xl uppercase text-xl shadow-4xl hover:scale-105 active:scale-95 transition-all">Siguiente Partida</button><button onClick={exitGame} className="bg-white/5 text-white/60 font-black py-5 rounded-3xl uppercase text-xs tracking-widest hover:bg-white/10 hover:text-white transition-all border border-white/5">Inicio</button></div></div></div>}</main>
          <aside className={`fixed inset-y-0 left-0 w-80 bg-stone-950/98 z-[300] border-r border-stone-800 transition-transform duration-500 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} p-8 flex flex-col shadow-4xl backdrop-blur-3xl safe-top`}><div className="flex justify-between items-center mb-10 pb-6 border-b border-white/5"><h3 className="text-white font-black text-2xl uppercase italic tracking-tighter">OPCIONES</h3><button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-600 text-white font-bold text-xl hover:bg-red-500 transition-colors shadow-lg">✕</button></div><div className="space-y-10 flex-1"><div className="space-y-4"><div className="flex justify-between text-[10px] font-black uppercase opacity-60"><span>Tablero</span><span>{Math.round(state.boardOpacity * 100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={state.boardOpacity} onChange={(e) => setState(s => ({...s, boardOpacity: parseFloat(e.target.value)}))} onMouseDown={(e) => e.stopPropagation()} className="w-full accent-yellow-600" /></div><div className="space-y-4"><div className="flex justify-between text-[10px] font-black uppercase opacity-60"><span>Cámara</span><span>{Math.round(state.cameraOpacity * 100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={state.cameraOpacity} onChange={(e) => setState(s => ({...s, cameraOpacity: parseFloat(e.target.value)}))} onMouseDown={(e) => e.stopPropagation()} className="w-full accent-yellow-600" /></div><div className="pt-4 flex flex-col gap-3">
                  <button onClick={(e) => { e.stopPropagation(); setState(s => { const next = {...s, isFlipped: !s.isFlipped}; broadcastState(next); return next; }); }} className="w-full bg-stone-800 py-4 rounded-2xl text-white font-black text-[10px] uppercase border border-white/5 hover:bg-stone-700 transition-all">Rotar Tablero</button>
                  <button onClick={(e) => { e.stopPropagation(); resetGame(state.gameMode); setIsMenuOpen(false); }} className="w-full bg-yellow-600/10 py-5 rounded-2xl text-yellow-600 font-black text-xs uppercase border border-yellow-600/20 hover:bg-yellow-600 hover:text-black transition-all">Reiniciar</button>
                  <button onClick={exitGame} className="w-full bg-white/5 py-5 rounded-2xl text-white font-black text-xs uppercase border border-white/10 hover:bg-red-600 hover:text-white transition-all">Salir</button>
                </div></div></aside>
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
