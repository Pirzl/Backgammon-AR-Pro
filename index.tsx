
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- AUDIO ENGINE ---
const playSound = (type: 'dice' | 'checker') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
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
  } else {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.1);
  }
};

// --- TYPES ---
export type Player = 'white' | 'red';
export type View = 'HOME' | 'ONLINE_LOBBY' | 'PLAYING';
export type GameMode = 'AI' | 'ONLINE' | 'LOCAL';

export interface Point { checkers: Player[]; }
export interface GrabbedInfo { player: Player; fromIndex: number; x: number; y: number; }

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
  boardOpacity: number;
  cameraOpacity: number;
  opponentConnected: boolean;
  isBlocked: boolean;
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
  const diceUniq = Array.from(new Set(state.movesLeft));
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

const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [history, setHistory] = useState<GameStateSnapshot[]>([]);
  
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
    opponentConnected: false, isBlocked: false
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [isARLoading, setIsARLoading] = useState(true);
  const rawHand = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, isPinching: false, isDetected: false });

  // AR SETUP
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
      const l = results.multiHandLandmarks[0];
      const dist = Math.sqrt(Math.pow(l[8].x - l[4].x, 2) + Math.pow(l[8].y - l[4].y, 2));
      rawHand.current = { x: (1 - l[8].x) * CANVAS_WIDTH, y: l[8].y * CANVAS_HEIGHT, isPinching: dist < PINCH_THRESHOLD, isDetected: true };
    });
    const camera = new CameraClass(videoRef.current, { onFrame: async () => { if (mounted) await hands.send({ image: videoRef.current! }); }, width: 1280, height: 720 });
    camera.start().then(() => { if (mounted) setIsARLoading(false); });
    return () => { mounted = false; camera.stop(); hands.close(); };
  }, [view]);

  const rollDice = useCallback((forced: boolean = false) => {
    playSound('dice');
    setHistory([]); // Limpiamos historial al tirar dados
    setState(s => {
      if (!forced && (s.movesLeft.length > 0 || s.turn !== s.userColor || s.winner)) return s;
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      const ns = { ...s, dice: [d1, d2], movesLeft: moves, isBlocked: !hasAnyLegalMove({ ...s, movesLeft: moves } as GameState) };
      return ns;
    });
  }, []);

  const passTurn = useCallback(() => {
    setHistory([]);
    setState(s => ({ ...s, turn: (s.turn === 'white' ? 'red' : 'white'), dice: [], movesLeft: [], isBlocked: false }));
  }, []);

  const undoMove = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setState(s => ({ ...s, ...last, isBlocked: false }));
  };

  const executeMove = (from: number, to: number | 'off', die: number) => {
    playSound('checker');
    // Guardamos estado antes del cambio
    const snapshot: GameStateSnapshot = { 
      points: JSON.parse(JSON.stringify(stateRef.current.points)), 
      bar: { ...stateRef.current.bar }, 
      off: { ...stateRef.current.off }, 
      movesLeft: [...stateRef.current.movesLeft] 
    };
    setHistory(h => [...h, snapshot]);

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
      else if (ns.movesLeft.length === 0) { ns.turn = ns.turn === 'white' ? 'red' : 'white'; ns.dice = []; ns.movesLeft = []; ns.isBlocked = false; setHistory([]); }
      
      if (ns.off.white === 15) ns.winner = 'white'; if (ns.off.red === 15) ns.winner = 'red';
      return ns;
    });
  };

  const getPos = useCallback((idx: number, reversed: boolean) => {
    const vIdx = reversed ? 23 - idx : idx;
    const isTop = vIdx >= 12;
    const relIdx = isTop ? 23 - vIdx : vIdx;
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50; 
    const x = xBase + (relIdx * 70) + (relIdx >= 6 ? CENTER_BAR_WIDTH : 0);
    return { x: x + 35, y: isTop ? BOARD_PADDING : CANVAS_HEIGHT - BOARD_PADDING, isTop };
  }, []);

  const getZone = useCallback((x: number, y: number, reversed: boolean) => {
    const xBase = (CANVAS_WIDTH - 900) / 2 + 50;
    if (x > 40 && x < xBase - 20) return { type: 'off' };
    if (Math.abs(x - (xBase + 450)) < 40) return { type: 'bar' };
    for (let i = 0; i < 24; i++) {
      const pos = getPos(i, reversed);
      if (Math.abs(x - pos.x) < 35) {
        if (pos.isTop && y < CANVAS_HEIGHT/2) return { type: 'point', index: i };
        if (!pos.isTop && y > CANVAS_HEIGHT/2) return { type: 'point', index: i };
      }
    }
    return null;
  }, [getPos]);

  // DRAW LOOP
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let anim: number;
    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      const s = stateRef.current;
      const rev = s.gameMode === 'ONLINE' && s.userColor === 'red';
      const tx = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.x : mouseState.current.x;
      const ty = (rawHand.current.isDetected && !mouseState.current.isDown) ? rawHand.current.y : mouseState.current.y;
      smoothHand.current.x += (tx - smoothHand.current.x) * 0.35;
      smoothHand.current.y += (ty - smoothHand.current.y) * 0.35;
      const { x, y } = smoothHand.current;
      const isPinch = (rawHand.current.isDetected && rawHand.current.isPinching) || mouseState.current.isDown;

      if (isPinch && !lastIsPinching.current && s.turn === s.userColor && !s.winner && !s.isBlocked) {
        const zone = getZone(x, y, rev);
        if (zone?.type === 'bar' && s.bar[s.turn] > 0) grabbedRef.current = { player: s.turn, fromIndex: -1, x, y };
        else if (zone?.type === 'point' && s.points[zone.index!].checkers.includes(s.turn)) grabbedRef.current = { player: s.turn, fromIndex: zone.index!, x, y };
        if (grabbedRef.current) setState(prev => ({ ...prev, grabbed: grabbedRef.current }));
      } else if (!isPinch && lastIsPinching.current) {
        if (grabbedRef.current) {
          const tz = getZone(x, y, rev);
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
      const xB = (CANVAS_WIDTH - 900) / 2 + 50;
      ctx.save(); ctx.globalAlpha = s.boardOpacity; ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, 900, CANVAS_HEIGHT - BOARD_PADDING * 2); ctx.restore();

      for (let i = 0; i < 24; i++) {
        const pos = getPos(i, rev);
        const isT = grabbedRef.current && s.movesLeft.some(d => isValidMove(s, s.turn, grabbedRef.current!.fromIndex, i, d));
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.95)' : 'rgba(190, 160, 110, 0.8)';
        if (isT) ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath(); ctx.moveTo(pos.x - 35, pos.y); ctx.lineTo(pos.x + 35, pos.y); ctx.lineTo(pos.x, pos.isTop ? pos.y + 280 : pos.y - 280); ctx.fill();
        s.points[i].checkers.forEach((p, idx) => { if (grabbedRef.current?.fromIndex === i && idx === s.points[i].checkers.length - 1) return; drawCh(ctx, pos.x, pos.isTop ? pos.y + 42 + idx * 42 : pos.y - 42 - idx * 42, p); });
      }
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(xB + 450 - 32, BOARD_PADDING, 64, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const c = s.bar[p as Player]; const vY = (p === s.userColor) ? CANVAS_HEIGHT - 120 : 120;
        for(let i=0; i<c; i++) { if (grabbedRef.current?.fromIndex === -1 && grabbedRef.current?.player === p && i === c - 1) continue; drawCh(ctx, xB + 450, vY + (p === s.userColor ? -i*42 : i*42), p as Player); }
      });
      for(let i=0; i<s.off.white; i++) drawCh(ctx, 80, CANVAS_HEIGHT - BOARD_PADDING - 40 - i*15, 'white');
      for(let i=0; i<s.off.red; i++) drawCh(ctx, 80, BOARD_PADDING + 40 + i*15, 'red');
      if (s.dice.length > 0) s.dice.forEach((d, i) => drawD(ctx, xB + 450 + (i === 0 ? -180 : 180), CANVAS_HEIGHT/2, d, s.turn));
      if (grabbedRef.current) drawCh(ctx, x, y, grabbedRef.current.player, true);
      if (rawHand.current.isDetected || mouseState.current.isDown) { ctx.beginPath(); ctx.arc(x, y, isPinch ? 12 : 24, 0, Math.PI * 2); ctx.strokeStyle = isPinch ? COLORS.gold : 'white'; ctx.lineWidth = 3; ctx.stroke(); }
      anim = requestAnimationFrame(draw);
    };
    anim = requestAnimationFrame(draw); return () => cancelAnimationFrame(anim);
  }, [view, getPos, getZone]);

  const drawCh = (ctx: any, x: number, y: number, p: Player, g = false) => {
    ctx.save(); if (g) { ctx.shadowBlur = 30; ctx.shadowColor = COLORS.gold; }
    const gr = ctx.createRadialGradient(x-8, y-8, 2, x, y, CHECKER_RADIUS);
    if (p === 'white') { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#ccc'); } else { gr.addColorStop(0, '#f55'); gr.addColorStop(1, '#a00'); }
    ctx.beginPath(); ctx.arc(x, y, CHECKER_RADIUS, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
  };

  const drawD = (ctx: any, x: number, y: number, v: number, p: Player) => {
    ctx.save(); ctx.fillStyle = p === 'white' ? '#fff' : '#f44';
    ctx.beginPath(); ctx.roundRect(x-40, y-40, 80, 80, 15); ctx.fill();
    ctx.fillStyle = p === 'white' ? '#000' : '#fff';
    const ds: any = { 1: [[0,0]], 2: [[-22,-22], [22,22]], 3: [[-22,-22], [0,0], [22,22]], 4: [[-22,-22], [22,-22], [-22,22], [22,22]], 5: [[-22,-22], [22,-22], [0,0], [-22,22], [22,22]], 6: [[-22,-22], [22,-22], [-22,0], [22,0], [-22,22], [22,22]] };
    ds[v].forEach(([dx, dy]: any) => { ctx.beginPath(); ctx.arc(x+dx, y+dy, 7, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
  };

  const handlePtr = (e: any) => {
    const el = canvasRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (e.clientX || e.touches?.[0].clientX) - r.left;
    const cy = (e.clientY || e.touches?.[0].clientY) - r.top;
    const scale = r.width / CANVAS_WIDTH;
    const ox = (r.width - CANVAS_WIDTH * scale) / 2;
    const oy = (r.height - CANVAS_HEIGHT * scale) / 2;
    mouseState.current.x = (cx - ox) / scale; mouseState.current.y = (cy - oy) / scale;
  };

  // IA STABILITY SYSTEM
  useEffect(() => {
    if (state.gameMode === 'AI' && state.turn !== state.userColor && !state.winner && view === 'PLAYING') {
      const timer = setTimeout(() => {
        const s = stateRef.current; if (s.winner || s.turn === s.userColor) return;
        if (s.dice.length === 0) { rollDice(true); return; }
        if (s.isBlocked || s.movesLeft.length === 0) { passTurn(); return; }
        const p = s.turn;
        const diceUniq = Array.from(new Set(s.movesLeft)).sort((a,b) => b-a);
        let moved = false;
        for (const d of diceUniq) {
          if (s.bar[p] > 0) {
            const target = getTargetPoint(p, -1, d);
            if (isValidMove(s, p, -1, target, d)) { executeMove(-1, target, d); moved = true; break; }
          } else {
            const order = p === 'red' ? Array.from({length:24},(_,i)=>i) : Array.from({length:24},(_,i)=>23-i);
            for (let idx of order) {
              if (s.points[idx].checkers.includes(p)) {
                const target = getTargetPoint(p, idx, d);
                if (target < 0 || target > 23) { if (isValidMove(s, p, idx, 'off', d)) { executeMove(idx, 'off', d); moved = true; break; } }
                else if (isValidMove(s, p, idx, target, d)) { executeMove(idx, target, d); moved = true; break; }
              }
            }
          }
          if (moved) break;
        }
        if (!moved) { if (s.movesLeft.length > 0) setState(prev => ({ ...prev, movesLeft: prev.movesLeft.slice(1) })); else passTurn(); }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.turn, state.dice.length, state.movesLeft.length, state.gameMode, view]);

  return (
    <div className="w-full h-full bg-black relative flex flex-col" onMouseMove={handlePtr} onTouchMove={handlePtr}
         onMouseDown={(e) => { if(!isMenuOpen) mouseState.current.isDown = true; handlePtr(e); }} onMouseUp={() => mouseState.current.isDown = false}
         onTouchStart={(e) => { if(!isMenuOpen) mouseState.current.isDown = true; handlePtr(e); }} onTouchEnd={() => mouseState.current.isDown = false}>
      
      {state.isBlocked && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 backdrop-blur-xl">
           <div className="bg-stone-900 border-2 border-yellow-600 p-12 rounded-[3rem] text-center max-w-md shadow-4xl scale-in-center">
              <h3 className="text-yellow-600 font-black text-4xl mb-4 italic uppercase tracking-tighter">¡SIN MOVIMIENTOS!</h3>
              <p className="text-white/60 mb-10 text-sm font-bold">No existen movimientos legales con los dados actuales.</p>
              <button onClick={passTurn} className="w-full bg-yellow-600 text-black font-black py-5 rounded-2xl text-xl uppercase shadow-xl hover:scale-105 active:scale-95 transition-all">TERMINAR TURNO</button>
           </div>
        </div>
      )}

      {view === 'HOME' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center">
          <h1 className="text-9xl font-black italic text-white mb-10 tracking-tighter drop-shadow-2xl">B-GAMMON</h1>
          <div className="flex flex-col gap-4 w-64">
            <button onClick={() => { setState(s => ({...s, points: initialPoints(), bar: {white:0,red:0}, off: {white:0,red:0}, turn:'white', gameMode: 'AI', winner: null})); setView('PLAYING'); setHistory([]); }} className="bg-white text-black font-black py-4 rounded-xl hover:bg-yellow-600 hover:text-white transition-all shadow-xl uppercase">Vs Máquina</button>
            <button onClick={() => setView('ONLINE_LOBBY')} className="bg-stone-800 text-white font-black py-4 rounded-xl hover:bg-stone-700 transition-all shadow-xl uppercase">Online</button>
          </div>
        </div>
      )}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-lg">
            <div className="flex items-center gap-6">
              <button onClick={() => setIsMenuOpen(true)} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-inner active:scale-95 transition-all">
                <div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div><div className="w-6 h-0.5 bg-white"></div>
              </button>
              {state.turn === state.userColor && history.length > 0 && (
                <button onClick={undoMove} className="bg-white/10 text-white font-black px-6 py-2.5 rounded-full text-[10px] uppercase border border-white/10 hover:bg-white/20 transition-all shadow-lg">Deshacer</button>
              )}
            </div>
            <div className="flex gap-4 items-center">
              <div className={`px-8 py-2.5 rounded-full font-black text-[11px] uppercase border-2 shadow-2xl transition-all ${state.turn === state.userColor ? 'bg-yellow-600 text-black border-yellow-600' : 'text-white/30 border-white/10'}`}>
                {state.turn === state.userColor ? 'TU TURNO' : 'IA PENSANDO'}
              </div>
              <button onClick={() => rollDice()} disabled={state.movesLeft.length > 0 || state.turn !== state.userColor || !!state.winner} className="bg-white text-black font-black px-8 py-2.5 rounded-full text-[11px] disabled:opacity-20 uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all">Tirar Dados</button>
            </div>
          </header>

          <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
            {isARLoading && <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center"><div className="w-16 h-16 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-white/60 font-black uppercase text-[10px]">Iniciando AR...</p></div>}
            <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-contain grayscale" autoPlay playsInline muted />
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="z-10 pointer-events-none w-full h-full object-contain" />
            {state.winner && (
              <div className="absolute inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center backdrop-blur-2xl">
                <h2 className="text-8xl font-black italic text-yellow-600 uppercase mb-8">{state.winner === state.userColor ? 'VICTORIA' : 'DERROTA'}</h2>
                <button onClick={() => window.location.reload()} className="bg-white text-black font-black px-12 py-5 rounded-full uppercase text-lg shadow-3xl hover:bg-yellow-600 hover:text-white transition-all">Reintentar</button>
              </div>
            )}
          </main>
          
          <aside className={`fixed inset-y-0 left-0 w-80 bg-stone-950/98 z-[100] border-r border-stone-800 transition-transform duration-500 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} p-8 flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.9)] backdrop-blur-3xl`}>
             <div className="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
                <h3 className="text-white font-black text-2xl uppercase italic tracking-tighter">AJUSTES</h3>
                <button onClick={() => setIsMenuOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-600 text-white font-bold text-xl hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20">✕</button>
             </div>
             <div className="space-y-10 flex-1">
                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase opacity-60"><span>Visibilidad Tablero</span><span>{Math.round(state.boardOpacity * 100)}%</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={state.boardOpacity} onChange={(e) => setState(s => ({...s, boardOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600" />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase opacity-60"><span>Brillo Cámara</span><span>{Math.round(state.cameraOpacity * 100)}%</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={state.cameraOpacity} onChange={(e) => setState(s => ({...s, cameraOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600" />
                </div>
                <div className="pt-10">
                  <button onClick={() => window.location.reload()} className="w-full bg-red-600/10 py-5 rounded-2xl text-red-500 font-black text-xs uppercase border border-red-600/20 hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-900/5">Abandonar Partida</button>
                  <button onClick={() => setIsMenuOpen(false)} className="w-full mt-4 bg-white/5 py-5 rounded-2xl text-white font-black text-xs uppercase border border-white/5 hover:bg-white/10 transition-all">Cerrar Menú</button>
                </div>
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
