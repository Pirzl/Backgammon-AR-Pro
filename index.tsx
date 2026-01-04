
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

// URL DE PRODUCCIÓN (CLOUD RUN)
const SERVER_URL = 'https://backgammon-ar-pro-1073169142406.us-west1.run.app/';

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

  // --- LÓGICA DE DADOS ---
  const rollDice = useCallback((forced: boolean = false) => {
    setState(s => {
      if (!forced && (s.movesLeft.length > 0 || s.turn !== s.userColor || s.winner)) return s;
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      
      playClack();
      const ns: GameState = { ...s, dice: [d1, d2], movesLeft: moves, history: [] };
      
      // ONLINE: Sincronización Maestra - Transmitimos estado de dados
      if (ns.gameMode === 'ONLINE' && socketRef.current?.connected) {
        socketRef.current.emit('update-game', {
          roomID: ns.roomID,
          gameState: { dice: [d1, d2], movesLeft: moves, status: 'PLAYING' }
        });
      }

      if (!hasAnyLegalMoves(ns)) {
        showNotify("SIN MOVIMIENTOS: TURNO CEDIDO");
        setTimeout(() => {
          setState(prev => {
            const nextTurn: Player = prev.turn === 'white' ? 'red' : 'white';
            const switchedState: GameState = { ...prev, turn: nextTurn, dice: [], movesLeft: [] };
            if (switchedState.gameMode === 'ONLINE' && socketRef.current?.connected) {
              socketRef.current.emit('update-game', { 
                roomID: prev.roomID, 
                gameState: { turn: nextTurn, dice: [], movesLeft: [] } 
              });
            }
            return switchedState;
          });
        }, 1500);
      }
      return ns;
    });
  }, [showNotify]);

  // --- SOCKET Y RED (MEJORADO PARA CLOUD RUN, CORS Y HANDSHAKE MAESTRO) ---
  const initSocket = useCallback((roomID: string, role: Player) => {
    const io = (window as any).io;
    if (!io) { showNotify("ERROR: SOCKET.IO NO CARGADO"); return; }
    if (socketRef.current) socketRef.current.disconnect();

    // Julie: Configuración crítica para Cloud Run + CORS + Sticky Sessions
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'], // Polling primero para asegurar handshake
      withCredentials: true,
      extraHeaders: {
        'Access-Control-Allow-Origin': '*'
      },
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 2000,
      timeout: 45000,
      forceNew: true
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', { roomID, role });
      showNotify(`CONECTADO A SALA: ${roomID}`);
      // El invitado pide el estado actual del anfitrión para empezar idénticos
      if (role === 'red') {
        socket.emit('request-sync', { roomID });
      }
    });

    // Handshake Sincronizado: El anfitrión detecta que el rival entró
    socket.on('player-joined', (data: any) => {
      setState(s => {
        // El Host (blanco) envía el tablero completo al nuevo invitado
        if (role === 'white' && socketRef.current?.connected) {
          socketRef.current.emit('update-game', { 
            roomID, 
            gameState: { 
              points: s.points, 
              bar: s.bar, 
              off: s.off, 
              turn: s.turn, 
              dice: s.dice, 
              movesLeft: s.movesLeft,
              opponentConnected: true,
              status: 'PLAYING'
            } 
          });
        }
        return { ...s, opponentConnected: true, status: 'PLAYING' };
      });
      showNotify("¡OPONENTE CONECTADO!");
    });

    // ESTADO MAESTRO (Master State): Actualización absoluta del juego
    socket.on('update-game', (data: any) => {
      if (data && data.gameState) {
        setState(s => ({ 
          ...s, 
          ...data.gameState, 
          opponentConnected: true, 
          status: 'PLAYING' 
        }));
        if (data.gameState.dice) playClack();
      }
    });

    socket.on('request-sync', () => {
      if (role === 'white') {
        setState(s => {
          socket.emit('update-game', { 
            roomID, 
            gameState: { 
              points: s.points, 
              bar: s.bar, 
              off: s.off, 
              turn: s.turn, 
              dice: s.dice, 
              movesLeft: s.movesLeft, 
              opponentConnected: true,
              status: 'PLAYING'
            } 
          });
          return s;
        });
      }
    });

    socket.on('opponent-disconnected', () => {
      setState(s => ({ ...s, opponentConnected: false }));
      showNotify("OPONENTE DESCONECTADO");
    });

    socket.on('connect_error', (err: any) => {
      console.warn("Retrying multiplayer link...", err);
    });

    // Cambiamos vista y estado inicial.
    // El Invitado (red) entra directamente a PLAYING ocultando el lobby.
    setState(s => ({ 
      ...s, 
      roomID, 
      userColor: role, 
      gameMode: 'ONLINE', 
      hasAccepted: true, 
      status: role === 'red' ? 'PLAYING' : 'WAITING',
      history: []
    }));
    setView('PLAYING');
  }, [showNotify]);

  const copyInvite = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?room=${state.roomID}`;
    navigator.clipboard.writeText(url).then(() => {
      showNotify("¡ENLACE DE INVITACIÓN COPIADO!");
    });
  }, [state.roomID, showNotify]);

  // Detección de Invitación por URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room && view === 'HOME') {
      setRoomFromUrl(room.toUpperCase());
    }
  }, [view]);

  // --- LÓGICA DE COORDENADAS ---
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
      const x1 = pos.x - slotWidth / 2;
      const x2 = pos.x + slotWidth / 2;
      const y1 = pos.isTop ? 0 : CANVAS_HEIGHT / 2;
      const y2 = pos.isTop ? CANVAS_HEIGHT / 2 : CANVAS_HEIGHT;
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return { type: 'point', index: i };
    }
    return null;
  }, [getPointPosition]);

  // --- LÓGICA DE JUEGO ---
  const canBearOff = (player: Player, points: Point[], barCount: number): boolean => {
    if (barCount > 0) return false;
    const homeRange = player === 'red' ? [18, 23] : [0, 5];
    return points.every((p, i) => !p.checkers.includes(player) || (i >= homeRange[0] && i <= homeRange[1]));
  };

  const isMoveLegal = (from: number, to: number | 'off', player: Player, points: Point[], bar: any, movesLeft: number[]): number | null => {
    if (movesLeft.length === 0) return null;
    const direction = player === 'red' ? 1 : -1;
    if (bar[player] > 0 && from !== -1) return null;
    let dist: number;
    if (to === 'off') {
      if (!canBearOff(player, points, bar[player])) return null;
      dist = player === 'red' ? 24 - from : from + 1;
      const exact = movesLeft.find(d => d === dist);
      if (exact) return exact;
      const larger = movesLeft.find(d => d > dist);
      if (larger) {
        const further = points.some((p, i) => p.checkers.includes(player) && (player === 'red' ? i < from : i > from));
        if (!further) return larger;
      }
      return null;
    }
    const targetIdx = Number(to);
    if (targetIdx < 0 || targetIdx > 23) return null;
    dist = from === -1 ? (player === 'red' ? (targetIdx + 1) : (24 - targetIdx)) : (targetIdx - from) * direction;
    if (!movesLeft.includes(dist)) return null;
    if (points[targetIdx].checkers.length >= 2 && points[targetIdx].checkers[0] !== player) return null;
    return dist;
  };

  const hasAnyLegalMoves = (s: GameState): boolean => {
    if (s.movesLeft.length === 0) return false;
    const uniqueDice = Array.from(new Set(s.movesLeft));
    const p = s.turn;
    if (s.bar[p] > 0) {
      for (const d of uniqueDice) {
        const to = p === 'red' ? (d - 1) : (24 - d);
        if (isMoveLegal(-1, to as any, p, s.points, s.bar, s.movesLeft)) return true;
      }
      return false;
    }
    for (let i = 0; i < 24; i++) {
      if (s.points[i].checkers.includes(p)) {
        for (const d of uniqueDice) {
          const dir = p === 'red' ? 1 : -1;
          const target = i + (d * dir);
          if (isMoveLegal(i, target as any, p, s.points, s.bar, s.movesLeft)) return true;
          if (isMoveLegal(i, 'off', p, s.points, s.bar, s.movesLeft)) return true;
        }
      }
    }
    return false;
  };

  const executeMove = (from: number, to: number | 'off', die: number, isRemote = false) => {
    playClack();
    
    setState(curr => {
      const snapshot = JSON.parse(JSON.stringify({ points: curr.points, bar: curr.bar, off: curr.off, movesLeft: curr.movesLeft, turn: curr.turn, dice: curr.dice }));
      const ns = JSON.parse(JSON.stringify(curr)) as GameState;
      if (!isRemote) ns.history.push(snapshot);
      
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
      
      if (ns.movesLeft.length === 0 || !hasAnyLegalMoves(ns)) {
        ns.turn = ns.turn === 'white' ? 'red' : 'white';
        ns.dice = []; ns.movesLeft = []; ns.history = [];
      }
      
      if (ns.off.white === 15) ns.winner = 'white';
      if (ns.off.red === 15) ns.winner = 'red';

      // ONLINE: Sincronización Maestra - Enviamos el tablero completo
      if (!isRemote && ns.gameMode === 'ONLINE' && socketRef.current?.connected) {
        socketRef.current.emit('update-game', {
          roomID: ns.roomID,
          gameState: { 
            points: ns.points, 
            bar: ns.bar, 
            off: ns.off, 
            turn: ns.turn, 
            dice: ns.dice, 
            movesLeft: ns.movesLeft,
            winner: ns.winner 
          }
        });
      }

      return ns;
    });
  };

  const undoMove = useCallback(() => {
    if (state.history.length === 0 || state.gameMode === 'ONLINE') return;
    setState(curr => {
      const lastState = curr.history.pop();
      if (!lastState) return curr;
      return { ...curr, ...lastState, history: [...curr.history] };
    });
    playClack();
  }, [state.history, state.gameMode]);

  // --- LÓGICA IA ---
  useEffect(() => {
    if (view !== 'PLAYING' || state.gameMode !== 'AI' || state.turn === state.userColor || state.winner) return;
    const aiTimer = setTimeout(() => {
      if (isAiActing.current) return;
      isAiActing.current = true;
      if (state.dice.length === 0 && state.movesLeft.length === 0) { rollDice(true); } 
      else {
        const p = state.turn;
        const possible: any[] = [];
        const uniqueDice = Array.from(new Set(state.movesLeft));
        if (state.bar[p] > 0) {
          uniqueDice.forEach(d => {
            const to = p === 'red' ? d - 1 : 24 - d;
            if (isMoveLegal(-1, to as any, p, state.points, state.bar, state.movesLeft)) possible.push({from: -1, to, die: d});
          });
        } else {
          for(let i=0; i<24; i++) {
            if (state.points[i].checkers.includes(p)) {
              uniqueDice.forEach(d => {
                const dir = p === 'red' ? 1 : -1;
                const to = i + (d * dir);
                if (isMoveLegal(i, to as any, p, state.points, state.bar, state.movesLeft)) possible.push({from: i, to, die: d});
                if (isMoveLegal(i, 'off', p, state.points, state.bar, state.movesLeft)) possible.push({from: i, to: 'off', die: d});
              });
            }
          }
        }
        if (possible.length > 0) {
          const move = possible.find(m => m.to === 'off') || possible.find(m => m.to !== 'off' && state.points[m.to].checkers.length === 1 && state.points[m.to].checkers[0] !== p) || possible[Math.floor(Math.random() * possible.length)];
          executeMove(move.from, move.to, move.die);
        }
      }
      isAiActing.current = false;
    }, 1500);
    return () => clearTimeout(aiTimer);
  }, [state.turn, state.movesLeft, state.dice, state.gameMode, view, state.winner, rollDice]);

  // --- RENDER LOOP ---
  useEffect(() => {
    if (view !== 'PLAYING') return;
    let animId: number;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animId = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const LERP = 0.25;
      const isMouse = mouseState.current.isDown;
      const targetX = Number((rawHand.current.isDetected && !isMouse) ? rawHand.current.x : mouseState.current.x);
      const targetY = Number((rawHand.current.isDetected && !isMouse) ? rawHand.current.y : mouseState.current.y);
      if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
        smoothHand.current.x += (targetX - smoothHand.current.x) * LERP;
        smoothHand.current.y += (targetY - smoothHand.current.y) * LERP;
      }
      const { x, y } = smoothHand.current;
      const isPinch = (rawHand.current.isDetected && rawHand.current.isPinching) || isMouse;
      const justPressed = isPinch && !lastIsPinching.current;
      const justReleased = !isPinch && lastIsPinching.current;
      lastIsPinching.current = isPinch;
      if (justPressed && state.turn === state.userColor && !state.winner) {
        setState(curr => {
          if (curr.grabbed || curr.movesLeft.length === 0) return curr;
          const zone = getTargetZone(x, y);
          if (zone?.type === 'bar' && curr.bar[curr.turn] > 0) { grabbedRef.current = { player: curr.turn, fromIndex: -1, x, y }; return { ...curr, grabbed: grabbedRef.current }; }
          if (zone?.type === 'point' && curr.points[zone.index].checkers.includes(curr.turn)) { grabbedRef.current = { player: curr.turn, fromIndex: zone.index, x, y }; return { ...curr, grabbed: grabbedRef.current }; }
          return curr;
        });
      } else if (justReleased) {
        setState(curr => {
          if (curr.grabbed) {
            const tz = getTargetZone(x, y);
            if (tz) {
              const to = tz.type === 'off' ? 'off' : (tz.type === 'point' ? tz.index! : null);
              if (to !== null) { const d = isMoveLegal(curr.grabbed.fromIndex, to as any, curr.turn, curr.points, curr.bar, curr.movesLeft); if (d) executeMove(curr.grabbed.fromIndex, to as any, d); }
            }
          }
          grabbedRef.current = null; return { ...curr, grabbed: null };
        });
      }
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const bW = 960; const xB = (CANVAS_WIDTH - bW) / 2;
      ctx.globalAlpha = state.boardOpacity;
      ctx.fillStyle = '#1c1917'; ctx.fillRect(xB, BOARD_PADDING, bW, CANVAS_HEIGHT - BOARD_PADDING * 2);
      for (let i = 0; i < 24; i++) {
        const pos = getPointPosition(i);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 22, 12, 0.95)' : 'rgba(190, 160, 110, 0.8)';
        ctx.beginPath(); ctx.moveTo(pos.x - 38, pos.y); ctx.lineTo(pos.x + 38, pos.y);
        ctx.lineTo(pos.x, pos.isTop ? pos.y + 260 : pos.y - 260); ctx.fill();
        state.points[i].checkers.forEach((p, idx) => { if (grabbedRef.current?.fromIndex === i && idx === state.points[i].checkers.length - 1) return; drawChecker(ctx, pos.x, pos.isTop ? pos.y + 36 + idx * 42 : pos.y - 36 - idx * 42, p); });
      }
      ctx.fillStyle = '#0c0a09'; ctx.fillRect(CANVAS_WIDTH/2 - 32, BOARD_PADDING, 64, CANVAS_HEIGHT - BOARD_PADDING * 2);
      ['white', 'red'].forEach(p => {
        const count = state.bar[p as Player];
        const isMe = p === state.userColor;
        const vY = isMe ? CANVAS_HEIGHT - 120 : 120;
        for(let i=0; i<count; i++) { if (grabbedRef.current?.fromIndex === -1 && grabbedRef.current?.player === p && i === count-1) continue; drawChecker(ctx, CANVAS_WIDTH/2, vY + (isMe ? -i*42 : i*42), p as Player); }
      });
      for(let i=0; i<state.off.red; i++) drawChecker(ctx, xB - 60, (isReversed ? CANVAS_HEIGHT - 80 : 80) + (isReversed ? -i*12 : i*12), 'red');
      for(let i=0; i<state.off.white; i++) drawChecker(ctx, xB - 60, (isReversed ? 80 : CANVAS_HEIGHT - 80) + (isReversed ? i*12 : -i*12), 'white');
      ctx.globalAlpha = 1.0; 
      if (state.dice.length > 0) state.dice.forEach((d, i) => drawDieSprite(ctx, CANVAS_WIDTH/2 + (i === 0 ? -160 : 160), CANVAS_HEIGHT/2, d, state.turn));
      if (grabbedRef.current) drawChecker(ctx, x, y, grabbedRef.current.player, true);
      if (rawHand.current.isDetected || isMouse) {
        ctx.beginPath(); ctx.arc(x, y, isPinch ? 12 : 24, 0, Math.PI * 2); 
        ctx.strokeStyle = isPinch ? COLORS.gold : 'rgba(255,255,255,0.8)'; 
        ctx.lineWidth = 3; ctx.stroke();
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [state, view, getTargetZone, getPointPosition, rawHand, isReversed]);

  const drawChecker = (ctx: CanvasRenderingContext2D, x: number, y: number, p: Player, glow = false) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.save();
    if (glow) { ctx.shadowBlur = 30; ctx.shadowColor = COLORS.gold; ctx.translate(0, -10); }
    ctx.beginPath(); ctx.arc(x, y, CHECKER_RADIUS, 0, Math.PI * 2);
    try {
      const gradX = Number(x - 8);
      const gradY = Number(y - 8);
      if (Number.isFinite(gradX) && Number.isFinite(gradY)) {
        const g = ctx.createRadialGradient(gradX, gradY, 4, Number(x), Number(y), CHECKER_RADIUS);
        if (p === 'white') { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#999999'); } else { g.addColorStop(0, '#ff4444'); g.addColorStop(1, '#660000'); }
        ctx.fillStyle = g; ctx.fill(); 
      } else { ctx.fillStyle = p === 'white' ? '#999999' : '#660000'; ctx.fill(); }
    } catch (e) { ctx.fillStyle = p === 'white' ? '#999999' : '#660000'; ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  };

  const drawDieSprite = (ctx: CanvasRenderingContext2D, x: number, y: number, v: number, player: Player) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.save(); ctx.translate(x-30, y-30); 
    ctx.fillStyle = player === 'white' ? '#fff' : '#ff3333';
    ctx.beginPath(); ctx.roundRect(0, 0, 60, 60, 10); ctx.fill();
    ctx.fillStyle = player === 'white' ? '#000' : '#fff';
    const dot = (cx: number, cy: number) => { ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill(); };
    if (v === 1) dot(30, 30);
    else if (v === 2) { dot(15, 15); dot(45, 45); }
    else if (v === 3) { dot(15, 15); dot(30, 30); dot(45, 45); }
    else if (v === 4) { dot(15, 15); dot(45, 15); dot(15, 45); dot(45, 45); }
    else if (v === 5) { dot(15, 15); dot(45, 15); dot(30, 30); dot(15, 45); dot(45, 45); }
    else if (v === 6) { dot(15, 15); dot(15, 30); dot(15, 45); dot(45, 15); dot(45, 30); dot(45, 45); }
    ctx.restore();
  };

  const handlePointer = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = Number(e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0));
    const cy = Number(e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0));
    const scale = Math.min((rect.width as number) / CANVAS_WIDTH, (rect.height as number) / CANVAS_HEIGHT);
    const ox = ((rect.width as number) - CANVAS_WIDTH * scale) / 2;
    const oy = ((rect.height as number) - CANVAS_HEIGHT * scale) / 2;
    const nx = (cx - (rect.left as number) - ox) / scale;
    const ny = (cy - (rect.top as number) - oy) / scale;
    if (Number.isFinite(nx) && Number.isFinite(ny)) { mouseState.current.x = Number(nx); mouseState.current.y = Number(ny); }
  };

  return (
    <div className="w-full h-full bg-black flex flex-col relative overflow-hidden select-none"
         style={{ touchAction: 'none' }}
         onMouseMove={handlePointer} onTouchMove={handlePointer}
         onMouseDown={(e) => { if(e.button === 0) mouseState.current.isDown = true; }}
         onMouseUp={() => mouseState.current.isDown = false}
         onTouchStart={(e) => { e.preventDefault(); mouseState.current.isDown = true; handlePointer(e); }}
         onTouchEnd={() => mouseState.current.isDown = false}>
      
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-600 text-black font-black px-10 py-4 rounded-full z-[300] shadow-4xl animate-bounce tracking-widest text-[10px] border-4 border-black uppercase">
          {notification}
        </div>
      )}

      {view === 'HOME' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-10 space-y-6">
          <div className="text-center mb-10">
            <h1 className="text-9xl font-black text-white italic tracking-tighter leading-none">B-GAMMON</h1>
            <p className="text-yellow-600 font-bold tracking-[0.5em] text-[10px] uppercase mt-2">Professional AR Edition</p>
          </div>
          
          {roomFromUrl ? (
            <div className="w-full max-w-md bg-stone-900 p-10 rounded-[3rem] border border-white/10 text-center animate-in fade-in slide-in-from-bottom-10 duration-700">
               <h2 className="text-white font-black text-2xl uppercase mb-4 tracking-tight italic">Invitación de Sala</h2>
               <div className="text-yellow-600 text-5xl font-black mb-8 tracking-widest">{roomFromUrl}</div>
               <button onClick={() => initSocket(roomFromUrl, 'red')} 
                       className="w-full bg-yellow-600 text-black font-black py-6 rounded-2xl text-xl hover:scale-105 transition-all shadow-3xl active:scale-95 uppercase">
                 ACEPTAR E INICIAR
               </button>
               <button onClick={() => setRoomFromUrl(null)} className="mt-6 text-white/20 text-[10px] font-black uppercase tracking-widest">Rechazar</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 w-full max-w-md">
              <button onClick={() => { setState(s => ({...s, gameMode: 'AI', hasAccepted: true, history: []})); setView('PLAYING'); playClack(); }} 
                      className="bg-white text-black font-black px-8 py-6 rounded-2xl text-lg hover:scale-[1.02] transition-all shadow-2xl active:scale-95 flex items-center justify-between group">
                VS MÁQUINA <span className="opacity-30 group-hover:opacity-100 transition-opacity">→</span>
              </button>
              <button onClick={() => setView('ONLINE_LOBBY')}
                      className="bg-stone-800 text-white font-black px-8 py-6 rounded-2xl text-lg border border-white/5 hover:bg-stone-700 transition-all flex items-center justify-between group">
                MULTIJUGADOR ONLINE <span className="text-yellow-600 opacity-50 group-hover:opacity-100 transition-opacity">●</span>
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'ONLINE_LOBBY' && (
        <div className="absolute inset-0 z-[100] bg-stone-950 flex flex-col items-center justify-center p-10">
          <div className="w-full max-w-md space-y-12">
            <div className="space-y-4">
              <h2 className="text-white font-black text-4xl italic uppercase">Crear Sala</h2>
              <button onClick={() => initSocket(Math.random().toString(36).substring(2, 8).toUpperCase(), 'white')} className="w-full bg-yellow-600 text-black font-black py-6 rounded-2xl hover:scale-[1.02] transition-all active:scale-95 shadow-xl uppercase">Generar Nueva Partida</button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="ID DE SALA" value={joinIdInput} onChange={(e) => setJoinIdInput(e.target.value.toUpperCase())} className="w-full bg-stone-900 border border-white/10 rounded-2xl py-6 px-8 text-white font-black text-center outline-none uppercase" />
              <button onClick={() => initSocket(joinIdInput, 'red')} disabled={!joinIdInput} className="w-full bg-white text-black font-black py-6 rounded-2xl disabled:opacity-20 uppercase shadow-lg">Unirse al Juego</button>
            </div>
            <button onClick={() => setView('HOME')} className="w-full text-white/30 text-[10px] font-black uppercase tracking-widest">Volver</button>
          </div>
        </div>
      )}

      {view === 'PLAYING' && (
        <>
          <header className="h-20 bg-stone-900/90 border-b border-white/5 flex items-center justify-between px-8 z-50 backdrop-blur-2xl">
            <div className="flex items-center gap-6">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-12 h-12 bg-stone-800 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-90 transition-transform">
                <div className={`w-6 h-0.5 bg-white transition-all ${isMenuOpen ? 'rotate-45 translate-y-[0.45rem]' : ''}`}></div>
                <div className={`w-6 h-0.5 bg-white transition-all ${isMenuOpen ? 'opacity-0' : ''}`}></div>
                <div className={`w-6 h-0.5 bg-white transition-all ${isMenuOpen ? '-rotate-45 -translate-y-[0.45rem]' : ''}`}></div>
              </button>
              {state.gameMode === 'ONLINE' && (
                <div className="flex items-center gap-4">
                   <div className="flex flex-col">
                    <span className="text-white/40 text-[8px] font-bold uppercase tracking-widest">SALA: {state.roomID}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${state.opponentConnected ? 'text-green-500' : 'text-yellow-600 animate-pulse'}`}>
                      {state.opponentConnected ? 'CONECTADO' : 'ESPERANDO...'}
                    </span>
                  </div>
                  {/* Julie: El botón de Copiar Link es exclusivo del Anfitrión (blanco) */}
                  {state.userColor === 'white' && (
                    <button onClick={copyInvite} className="bg-stone-800 p-2 rounded-lg border border-white/5 hover:bg-stone-700 active:scale-95 transition-all">
                      <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 21H8V7h11m0-2H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2m-3-4H4a2 2 0 00-2 2v14h2V3h12V1z"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-4 items-center">
              <button onClick={undoMove} disabled={state.history.length === 0 || state.gameMode === 'ONLINE'} className="w-10 h-10 bg-stone-800 rounded-full flex items-center justify-center disabled:opacity-20 transition-all border border-white/5 shadow-inner hover:bg-stone-700">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
              <div className={`px-8 py-2.5 rounded-full font-black text-[10px] tracking-widest uppercase border-2 transition-all ${state.turn === state.userColor ? 'bg-yellow-600 text-black border-yellow-600' : 'bg-transparent text-white/30 border-white/10'}`}>
                {state.turn === state.userColor ? 'TU TURNO' : 'TURNO RIVAL'}
              </div>
              <button onClick={() => rollDice()} disabled={state.movesLeft.length > 0 || state.turn !== state.userColor || !!state.winner} className="bg-white text-black font-black px-8 py-2.5 rounded-full text-[10px] tracking-widest disabled:opacity-10 active:scale-95 transition-all shadow-xl">🎲 TIRAR</button>
            </div>
          </header>

          <aside className={`fixed inset-y-0 left-0 w-80 bg-stone-950/98 z-[60] border-r border-stone-800 transition-transform duration-500 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} p-8 flex flex-col backdrop-blur-3xl shadow-4xl`}>
             <div className="flex justify-between items-center mb-10">
               <h3 className="text-white font-black text-xl italic uppercase tracking-tighter">AJUSTES AR</h3>
               <button onClick={() => setIsMenuOpen(false)} className="text-yellow-600 font-black text-xl hover:scale-110 transition-transform">✕</button>
             </div>
             <div className="space-y-8 flex-1">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Opacidad Tablero</label>
                    <span className="text-[10px] font-mono text-yellow-600">{Math.round(state.boardOpacity * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={state.boardOpacity} onChange={(e) => setState(s => ({...s, boardOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Opacidad Cámara</label>
                    <span className="text-[10px] font-mono text-yellow-600">{Math.round(state.cameraOpacity * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={state.cameraOpacity} onChange={(e) => setState(s => ({...s, cameraOpacity: parseFloat(e.target.value)}))} className="w-full accent-yellow-600 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="pt-8 border-t border-white/5 space-y-4">
                  <button onClick={() => window.location.reload()} className="w-full bg-stone-900 border border-white/10 py-4 rounded-xl text-white font-black text-[10px] uppercase tracking-widest hover:bg-stone-800 transition-colors">Menú Principal</button>
                  <button onClick={() => setState(s => ({...s, points: initialPoints(), bar: {white:0,red:0}, off: {white:0,red:0}, history: [], dice: [], movesLeft: []}))} className="w-full bg-red-950/20 border border-red-500/20 py-4 rounded-xl text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-950/40 transition-colors">Reiniciar Tablero</button>
                </div>
             </div>
             <div className="mt-auto text-center opacity-20 text-[8px] font-bold uppercase tracking-[0.4em]">v3.4 Multi-Master Edition</div>
          </aside>

          <main className="flex-1 relative flex items-center justify-center bg-black overflow-hidden" style={{ touchAction: 'none' }}>
            {isARLoading && (
              <div className="absolute inset-0 z-[150] bg-stone-950 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-white font-black tracking-widest text-[10px] uppercase animate-pulse">Sincronizando Realidad...</p>
              </div>
            )}
            <div className="ar-container relative w-full h-full max-w-[1200px] max-h-[700px] shadow-inner">
              <video ref={videoRef} style={{ opacity: state.cameraOpacity }} className="absolute inset-0 w-full h-full object-cover grayscale brightness-75 transition-opacity duration-300" autoPlay playsInline muted />
              <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none drop-shadow-2xl" />
            </div>
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
