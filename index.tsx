
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- AUDIO ENGINE (Julie's Synthetic SFX) ---
const playSound = (type: 'dice' | 'checker') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  
  if (type === 'dice') {
    const osc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime + 0.1);
  } else {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  }
};

// --- POLYFILLS ---
if (typeof (CanvasRenderingContext2D as any).prototype.roundRect !== 'function') {
  (CanvasRenderingContext2D as any).prototype.roundRect = function (x: number, y: number, w: number, h: number, r: number) {
    if (typeof r === 'undefined') r = 0;
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// --- TYPES ---
export type Player = 'white' | 'red';
export type View = 'HOME' | 'ONLINE_LOBBY' | 'PLAYING';
export type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

export interface Point { checkers: Player[]; }
export interface GrabbedInfo { player: Player; fromIndex: number; x: number; y: number; }

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
  boardOpacity: number;
  cameraOpacity: number;
  opponentConnected: boolean;
  history: GameStateSnapshot[]; 
  isBlocked: boolean;
}

export interface GameStateSnapshot {
  points: Point[];
  bar: { white: number, red: number };
  off: { white: number, red: number };
  movesLeft: number[];
}

// --- CONSTANTS ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const BOARD_PADDING = 40;
const CENTER_BAR_WIDTH = 60;
const CHECKER_RADIUS = 26;
const PINCH_THRESHOLD = 0.045;
const COLORS = { white: '#ffffff', red: '#ff2222', gold: '#fbbf24' };

const initialPoints = (): Point[] => {
  const p = Array(24).fill(null).map(() => ({ checkers: [] as Player[] }));
  const add = (idx: number, n: number, col: Player) => {
    for(let i=0; i<n; i++) p[idx].checkers.push(col);
  };
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
  if (state.bar[p] > 0) {
    return state.movesLeft.some(die => isValidMove(state, p, -1, getTargetPoint(p, -1, die), die));
  }
  for (let i = 0; i < 24; i++) {
    if (state.points[i].checkers.includes(p)) {
      if (state.movesLeft.some(die => {
        const target = getTargetPoint(p, i, die);
        return (target >= 0 && target <= 23) ? isValidMove(state, p, i, target, die) : isValidMove(state, p, i, 'off', die);
      })) return true;
    }
  }
  return false;
};

const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [joinIdInput, setJoinIdInput] = useState('');
  const [invitationId, setInvitationId] = useState<string | null>(null);
  
  const socketRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mouseState = useRef({ x: 0, y: 0, isDown: false });
  const smoothHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  const lastIsPinching = useRef(false);
  const grabbedRef = useRef<GrabbedInfo | null>(null);

  const [state, setState] = useState<GameState>({
    points: initialPoints(), bar: { white: 0, red: 0 }, off: { white: 0, red: 0 },
    turn: 'white', dice: [], movesLeft: [], grabbed: null,
    winner: null, gameMode: 'LOCAL', userColor: 'white',
    roomID: '', boardOpacity: 0.9, cameraOpacity: 0.35,
    opponentConnected: false, history: [], isBlocked: false
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [isARLoading, setIsARLoading] = useState(true);
  const rawHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, isPinching: false, isDetected: false });

  // AR HAND TRACKING
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let mounted = true;
    const HandsClass = (window as any).Hands;
    const CameraClass = (window as any).Camera;
    if (!HandsClass || !CameraClass || !videoRef.current) return;

    const hands = new HandsClass({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    hands.onResults((results: any) => {
      if (!mounted || !results.multiHandLandmarks?.length) { rawHand.current.isDetected = false; return; }
      const landmarks = results.multiHandLandmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      const dist = Math.sqrt(Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2));
      rawHand.current = { 
        x: (1 - indexTip.x) * CANVAS_WIDTH, 
        y: indexTip.y * CANVAS_HEIGHT, 
        isPinching: dist < PINCH_THRESHOLD, 
        isDetected: true 
      };
    });

    const camera = new CameraClass(videoRef.current, {
      onFrame: async () => { if (mounted && hands) await hands.send({ image: videoRef.current! }); },
      width: 1280, height: 720,
    });
    camera.start().then(() => { if (mounted) setIsARLoading(false); });

    return () => { mounted = false; camera.stop(); hands.close(); };
  }, [view]);

  // SOCKET LOGIC - Julie's Offline Resilience Fix
  const initSocket = useCallback((roomID: string, role: Player) => {
    const io = (window as any).io;
    if (!io) return;
    if (socketRef.current) socketRef.current.disconnect();

    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      timeout: 5000
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('join-room', { roomID, role });
      if (role === 'red') socket.emit('guest-ready', { roomID });
    });

    socket.on('guest-ready', () => {
      if (stateRef.current.userColor === 'white') {
        socket.emit('update-game', { roomID: stateRef.current.roomID, gameState: { ...stateRef.current, opponentConnected: true } });
      }
    });

    socket.on('update-game', (data: any) => {
      if (data?.gameState) {
        setState(s => ({ ...s, ...data.gameState, opponentConnected: true }));
      }
    });

    socket.on('connect_error', () => {
      console.warn("Red no disponible. Conmutando a local.");
    });

    setState(s => ({ ...s, roomID, userColor: role, gameMode: 'ONLINE', opponentConnected: false }));
    setView('PLAYING');
  }, []);

  const rollDice = useCallback((forced: boolean = false) => {
    playSound('dice');
    setState(s => {
      if (!forced && (s.movesLeft.length > 0 || s.turn !== s.userColor || s.winner)) return s;
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      const blocked = !hasAnyLegalMove({ ...s, movesLeft: moves } as GameState);
      const nextState = { ...s, dice: [d1, d2], movesLeft: moves, history: [], isBlocked: blocked };
      if (nextState.gameMode === 'ONLINE' && socketRef.current?.connected) {
        socketRef.current.emit('update-game', { roomID: nextState.roomID, gameState: nextState });
      }
      return nextState;
    });
  }, []);

  const passTurn = useCallback(() => {
    setState(s => {
      const ns = { ...s, turn: (s.turn === 'white' ? 'red' : 'white') as Player, dice: [], movesLeft: [], isBlocked: false, history: [] };
      if (ns.gameMode === 'ONLINE' && socketRef.current?.connected) socketRef.current.emit('update-game', { roomID: ns.roomID, gameState: ns });
      return ns;
    });
  }, []);

  const executeMove = (from: number, to: number | 'off', die: number) => {
    playSound('checker');
    setState(curr => {
      if (!isValidMove(curr, curr.turn, from, to, die)) return curr;
      const ns = JSON.parse(JSON.stringify(curr)) as GameState;
      const p = ns.turn;
      
      if (from === -1) ns.bar[p]--; else ns.points[from].checkers.pop();
      if (to === 'off') ns.off[p]++;
      else {
        const target = ns.points[to as number];
        if (target.checkers.length === 1 && target.checkers[0] !== p) { ns.bar[target.checkers[0]]++; target.checkers = [p]; }
        else target.checkers.push(p);
      }
      ns.movesLeft.splice(ns.movesLeft.indexOf(die), 1);
      
      if (ns.movesLeft.length > 0 && !hasAnyLegalMove(ns)) ns.isBlocked = true;
      else if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; ns.movesLeft = []; ns.history = []; ns.isBlocked = false; }
      
      if (ns.off.white === 15) ns.winner = 'white';
      if (ns.off.red === 15) ns.winner = 'red';
      
      if (ns.gameMode === 'ONLINE' && socketRef.current?.connected) socketRef.current.emit('update-game', { roomID: ns.roomID, gameState: ns });
      return ns;
    });
  };

  const getPos = useCallback((idx: number, reversed: boolean) => {
    const visualIdx = reversed ? 23 - idx : idx;
    const isTop = visualIdx >= 12;
    const relIdx = isTop ? 23 - visualIdx : visualIdx;
    const section = relIdx >= 6 ? 1 : 0;
    const boardWidth = 900; 
    const xBase = (CANVAS_WIDTH - boardWidth) / 2 + 50; 
    const slotWidth = (boardWidth - CENTER_BAR_WIDTH) / 12;
    const x = xBase + (relIdx * slotWidth) + (section * CENTER_BAR_WIDTH);
    return { x: x + slotWidth / 2, y: isTop ? BOARD_PADDING : CANVAS_HEIGHT - BOARD_PADDING, isTop };
  }, []);

  const getZone = useCallback((x: number, y: number, reversed: boolean) => {
    const boardWidth = 900; const xBase = (CANVAS_WIDTH - boardWidth) / 2 + 50;
    const slotWidth = (boardWidth - CENTER_BAR_WIDTH) / 12;
    if (x > 40 && x < xBase - 20) return { type: 'off' };
    if (Math.abs(x - (xBase + boardWidth/2)) < 35) return { type: 'bar' };
    for (let i = 0; i < 24; i++) {
      const pos = getPos(i, reversed);
      if (Math.abs(x - pos.x) < slotWidth/2) {
        if (pos.isTop && y < CANVAS_HEIGHT/2) return { type: 'point', index: i };
        if (!pos.isTop && y > CANVAS_HEIGHT/2) return { type: 'point', index: i };
      }
    }
    return null;
  }, [getPos]);

  // DRAWING LOOP
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let animId: number;
    const draw = () => {
      const canvas = canvasRef.current; if (!canvas) { animId = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const s = stateRef.current;
      const reversed = s.gameMode === 'ONLINE' && s.userColor === 'red';
      
      const targetX = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.x : mouseState.current.x;
      const targetY = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.y : mouseState.current.y;
      smoothHand.current.x += (targetX - smoothHand.current.x) * 0.35;
      smoothHand.current.y += (targetY - smoothHand.current.y) * 0.35;
      const { x, y } = smoothHand.current;
      const isPinch = (rawHand.current.isDetected && rawHand.current.isPinching) || mouseState.current.isDown;
      
      if (isPinch && !lastIsPinching.current && s.turn === s.userColor && !s.winner && !s.isBlocked) {
        const zone = getZone(x, y, reversed);
        if (zone?.type === 'bar' && s.bar[s.turn] > 0) grabbedRef.current = { player: s.turn, fromIndex: -1, x, y };
        else if (zone?.type === 'point' && s.points[zone.index!].checkers.includes(s.turn)) grabbedRef.current = { player: s.turn, fromIndex: zone.index!, x, y };
        if (grabbedRef.current) setState(prev => ({ ...prev, grabbed: grabbedRef.current }));
      } else if (!isPinch && lastIsPinching.current) {
        if (grabbedRef.current) {
          const tz = getZone(x, y, reversed);
          if (tz) {
            const to = tz.type === 'off' ? 'off' : (tz.type === 'point' ? tz.index! : null);
            if (to !== null) {
              const possibleDice = s.movesLeft.filter(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, to as any, d));
              if (possibleDice.length > 0) executeMove(grabbedRef.current.fromIndex, to as any, possibleDice[0]);
            }
          }
        }
        grabbedRef.current = null; setState(prev => ({ ...prev, grabbed: null }));
      }
      lastIsPinching.current = isPinch;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const bW = 900; const xB = (CANVAS_WIDTH - bW) / 2 + 50;
      ctx.save(); ctx.globalAlpha = s.boardOpacity;
      ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, bW, CANVAS_HEIGHT - BOARD_PADDING * 2); ctx.restore();

      for (let i = 0; i < 24; i++) {
        const pos = getPos(i, reversed);
        const isTarget = grabbedRef.current && s.movesLeft.some(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, i, d));
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.95)' : 'rgba(190, 160, 110, 0.8)';
        if (isTarget) ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath(); ctx.moveTo(pos.x - 36, pos.y); ctx.lineTo(pos.x + 36, pos.y); ctx.lineTo(pos.x, pos.isTop ? pos.y + 280 : pos.y - 280); ctx.fill();
        s.points[i].checkers.forEach((p, idx) => { 
          if (grabbedRef.current?.fromIndex === i && idx === s.points[i].checkers.length - 1) return; 
          drawChecker(ctx, pos.x, pos.isTop ? pos.y + 42 + idx * 42 : pos.y - 42 - idx * 42, p); 
        });
      }
      
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(xB + bW/2 - 32, BOARD_PADDING, 64, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const count = s.bar[p as Player];
        const vY = (p === s.userColor) ? CANVAS_HEIGHT - 120 : 120;
        for(let i=0; i<count; i++) {
          if (grabbedRef.current?.fromIndex === -1 && grabbedRef.current?.player === p && i === count - 1) continue;
          drawChecker(ctx, xB + bW/2, vY + (p === s.userColor ? -i*42 : i*42), p as Player);
        }
      });

      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(40, BOARD_PADDING, 80, CANVAS_HEIGHT - BOARD_PADDING*2);
      for(let i=0; i<s.off.white; i++) drawChecker(ctx, 80, CANVAS_HEIGHT - BOARD_PADDING - 40 - i*15, 'white');
      for(let i=0; i<s.off.red; i++) drawChecker(ctx, 80, BOARD_PADDING + 40 + i*15, 'red');

      if (s.dice.length > 0) s.dice.forEach((d, i) => drawDie(ctx, xB + bW/2 + (i === 0 ? -180 : 180), CANVAS_HEIGHT/2, d, s.turn));
      if (grabbedRef.current) drawChecker(ctx, x, y, grabbedRef.current.player, true);
      
      if (rawHand.current.isDetected || mouseState.current.isDown) { 
        ctx.beginPath(); ctx.arc(x, y, isPinch ? 12 : 24, 0, Math.PI * 2); 
        ctx.strokeStyle = isPinch ? COLORS.gold : 'white'; ctx.lineWidth = 3; ctx.stroke(); 
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [view, getPos, getZone]);

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, p: Player, glow = false) => {
    ctx.save();
    if (glow) { ctx.shadowBlur = 30; ctx.shadowColor = COLORS.gold; }
    const grad = ctx.createRadialGradient(x - 8, y - 8, 2, x, y, CHECKER_RADIUS);
    if (p === 'white') { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#cccccc'); }
    else { grad.addColorStop(0, '#ff5555'); grad.addColorStop(1, '#aa0000'); }
    ctx.beginPath(); ctx.arc(x, y, CHECKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill(); ctx.restore();
  };

  const drawDie = (ctx: CanvasRenderingContext2D, x: number, y: number, v: number, player: Player) => {
    ctx.save(); ctx.fillStyle = player === 'white' ? '#fff' : '#ff4444';
    ctx.beginPath(); (ctx as any).roundRect(x-40, y-40, 80, 80, 15); ctx.fill();
    ctx.fillStyle = player === 'white' ? '#000' : '#fff';
    const dots: any = { 1: [[0,0]], 2: [[-22,-22], [22,22]], 3: [[-22,-22], [0,0], [22,22]], 4: [[-22,-22], [22,-22], [-22,22], [22,22]], 5: [[-22,-22], [22,-22], [0,0], [-22,22], [22,22]], 6: [[-22,-22], [22,-22], [-22,0], [22,0], [-22,22], [22,22]] };
    dots[v].forEach(([dx, dy]: number[]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, 7, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  };

  const handlePointer = (e: any) => {
    const el = canvasRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const cy = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    const canvasRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
    const rectRatio = rect.width / rect.height;
    let scale, ox = 0, oy = 0;
    if (rectRatio > canvasRatio) { scale = rect.height / CANVAS_HEIGHT; ox = (rect.width - CANVAS_WIDTH * scale) / 2; }
    else { scale = rect.width / CANVAS_WIDTH; oy = (rect.height - CANVAS_HEIGHT * scale) / 2; }
    mouseState.current.x = (cx - ox) / scale; 
    mouseState.current.y = (cy - oy) / scale;
  };

  // ATOMIC AI WITH WATCHDOG - Prevent freezes
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn !== state.userColor && !state.winner && view === 'PLAYING') {
      const timer = setTimeout(() => {
        const s = stateRef.current;
        if (s.winner || s.turn === s.userColor) return;
        if (s.dice.length === 0) { rollDice(true); return; }
        if (s.isBlocked || s.movesLeft.length === 0) { passTurn(); return; }

        const p = s.turn;
        const die = s.movesLeft[0];
        let moved = false;

        if (s.bar[p] > 0) {
          const target = getTargetPoint(p, -1, die);
          if (isValidMove(s, p, -1, target, die)) { executeMove(-1, target, die); moved = true; }
        } else {
          const order = p === 'red' ? Array.from({length:24},(_,i)=>i) : Array.from({length:24},(_,i)=>23-i);
          for (let idx of order) {
            if (s.points[idx].checkers.includes(p)) {
              const target = getTargetPoint(p, idx, die);
              if (target < 0 || target > 23) {
                if (isValidMove(s, p, idx, 'off', die)) { executeMove(idx, 'off', die); moved = true; break; }
              } else if (isValidMove(s, p, idx, target, die)) {
                executeMove(idx, target, die); moved = true; break;
              }
            }
          }
        }

        if (!moved) {
          if (s.movesLeft.length > 1) setState(prev => ({ ...prev, movesLeft: prev.movesLeft.slice(1) }));
          else passTurn();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.turn, state.dice.length, state.movesLeft.length, state.gameMode, view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && view === 'HOME') setInvitationId(room);
  }, [view]);

  return (
    <div className="w-full h-full bg-black relative overflow-hidden flex flex-col" 
         onMouseMove={handlePointer} onTouchMove={handlePointer}
         onMouseDown={(e) => { mouseState.current.isDown = true; handlePointer(e); }} onMouseUp={() => { mouseState.current.isDown = false; }}
         onTouchStart={(e) => { mouseState.current.isDown = true; handlePointer(e); }} onTouchEnd={() => { mouseState.current.isDown = false; }}>
      
      {state.isBlocked && state.turn === state.userColor && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/70 backdrop-blur-md">
           <div className="bg-stone-900 border-2 border-yellow-600 p-12 rounded-[3rem] text-center max-w-md shadow-4xl animate-in zoom-in">
              <h3 className="text-yellow-600 font-black text-4xl mb-6 italic">BLOQUEADO</h3>
              <p className="text-white/50 mb-10 text-sm uppercase">No tienes movimientos legales posibles.</p>
              <button onClick={passTurn} className="bg-yellow-600 text-black font-black py-5 px-16 rounded-2xl text-xl uppercase shadow-xl active:scale-95 transition-all">PASAR TURNO</button>
           </div>
        </div>
      )}

      {view === 'HOME' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center">
          <h1 className="text-9xl font-black italic text-white mb-10 tracking-tighter drop-shadow-2xl">B-GAMMON</h1>
          {invitationId ? (
            <div className="bg-stone-900 p-10 rounded-[3rem] text-center border border-white/10 shadow-3xl">
               <h2 className="text-white font-black text-2xl mb-4 italic uppercase">¡Invitación!</h2>
               <p className="text-white/40 mb-8 text-xs uppercase tracking-widest">Sala: {invitationId}</p>
               <button onClick={() => initSocket(invitationId, 'red')} className="bg-yellow-600 text-black font-black py-6 px-20 rounded-2xl text-xl hover:scale-105 transition-all">UNIRSE AHORA</button>
               <button onClick={() => setInvitationId(null)} className="block w-full mt-6 text-white/20 text-[10px] font-bold uppercase">Rechazar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-64">
              <button onClick={() => { setState(s => ({...s, points: initialPoints(), bar: {white:0,red:0}, off: {white:0,red:0}, turn:'white', gameMode: 'AI', userColor: 'white', winner: null, history: [], isBlocked: false})); setView('PLAYING'); }} className="bg-white text-black font-black py-4 rounded-xl uppercase hover:bg-yellow-600 hover:text-white transition-all shadow-xl">Vs Máquina</button>
              <button onClick={() => setView('ONLINE_LOBBY')} className="bg-stone-800 text-white font-black py-4 rounded-xl uppercase hover:bg-stone-700 transition-all shadow-xl">Online / Amigo</button>
            </div>
          )}
        </div>
      )}

      {view === 'ONLINE_LOBBY' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center space-y-6">
          <button onClick={() => initSocket(Math.random().toString(36).substring(2, 8).toUpperCase(), 'white')} className="w-64 bg-yellow-600 text-black font-black py-4 rounded-xl uppercase shadow-2xl">Crear Sala</button>
          <div className="flex gap-2">
            <input type="text" placeholder="ID" value={joinIdInput} onChange={(e) => setJoinIdInput(e.target.value.toUpperCase())} className="bg-stone-900 border border-white/10 rounded-xl px-4 text-center text-white font-bold tracking-widest" />
            <button onClick={() => initSocket(joinIdInput, 'red')} className="bg-white text-black font-black px-6 py-4 rounded-xl uppercase shadow-xl">Unirse</button>
          </div>
          <button onClick={() => setView('HOME')} className="text-white/30 text-xs uppercase font-bold tracking-tighter">Volver</button>
        </div>
      )}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-lg">
            <div className="flex items-center gap-6">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-inner active:scale-95 transition-all">
                <div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div>
              </button>
              {state.gameMode === 'ONLINE' && (
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-white/40 uppercase font-black">{state.roomID}</span>
                    <span className={`text-[10px] font-bold uppercase ${state.opponentConnected ? 'text-green-500' : 'text-yellow-600 animate-pulse'}`}>{state.opponentConnected ? 'EN LÍNEA' : 'ESPERANDO...'}</span>
                  </div>
                  {state.userColor === 'white' && !state.opponentConnected && <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.roomID}`); alert("Link copiado!"); }} className="bg-stone-800 text-yellow-600 text-[9px] px-3 py-1 rounded font-black uppercase border border-yellow-600/30 shadow-lg">Copiar Invitación</button>}
                </div>
              )}
            </div>
            <div className="flex gap-4 items-center">
              <div className={`px-8 py-2.5 rounded-full font-black text-[11px] uppercase border-2 shadow-2xl transition-all ${state.turn === state.userColor ? 'bg-yellow-600 text-black border-yellow-600 animate-pulse' : 'text-white/30 border-white/10'}`}>
                {state.turn === state.userColor ? 'TU TURNO' : 'TURNO RIVAL'}
              </div>
              <button onClick={() => rollDice()} disabled={state.movesLeft.length > 0 || state.turn !== state.userColor || !!state.winner} className="bg-white text-black font-black px-8 py-2.5 rounded-full text-[11px] disabled:opacity-20 uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all">Tirar Dados</button>
            </div>
          </header>

          <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
            {isARLoading && <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center"><div className="w-16 h-16 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-white/60 font-black uppercase text-[10px] tracking-widest">Sincronizando Sensor AR...</p></div>}
            <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-contain grayscale" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-10 pointer-events-none w-full h-full object-contain" />
            
            {state.turn !== state.userColor && state.gameMode === 'AI' && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-stone-900/80 px-6 py-2 rounded-full border border-white/10 z-50">
                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest animate-pulse">La IA está pensando...</p>
              </div>
            )}
          </main>
          
          <aside className={`fixed inset-y-0 left-0 w-80 bg-stone-950/98 z-[60] border-r border-stone-800 transition-transform duration-500 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} p-8 flex flex-col shadow-4xl backdrop-blur-3xl`}>
             <div className="flex justify-between items-center mb-10">
               <h3 className="text-white font-black text-xl uppercase italic">OPCIONES</h3>
               <button onClick={() => setIsMenuOpen(false)} className="text-yellow-600 text-2xl font-black p-2">✕</button>
             </div>
             <div className="space-y-8 flex-1">
                <div className="pt-6 border-t border-white/5 space-y-3">
                  <label className="text-[10px] font-bold uppercase opacity-40">Visibilidad Tablero</label>
                  <input type="range" min="0" max="1" step="0.01" value={state.boardOpacity} onChange={(e) => setState(s => ({...s, boardOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase opacity-40">Brillo Cámara</label>
                  <input type="range" min="0" max="1" step="0.01" value={state.cameraOpacity} onChange={(e) => setState(s => ({...s, cameraOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600" />
                </div>
                <button onClick={() => window.location.reload()} className="w-full bg-red-950/30 py-4 rounded-xl text-red-500 font-black text-[11px] uppercase border border-red-900/30 hover:bg-red-600 hover:text-white transition-all">Abandonar Juego</button>
             </div>
          </aside>
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
