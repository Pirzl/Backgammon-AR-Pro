import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { pongAudio } from './pongAudio';
import ManoIzqLateral from '../assets/mano_izq_lateral.svg';
import ManoDerLateral from '../assets/mano_der_lateral.svg';
import ManoBalaIzqLateral from '../assets/mano_bala_izq_lateral.svg';
import ManoBalaDerLateral from '../assets/mano_bala_der_lateral.svg';
import BalaPowerupIcon from '../assets/bala_powerup.svg';

/**
 * Tints an image with a specific color using a temporary canvas.
 */
function tintImage(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // Use natural dimensions of the image or fallback to square if not loaded
  canvas.width = img.naturalWidth || 256;
  canvas.height = img.naturalHeight || 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  return canvas;
}
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PADDLE_HEIGHT, 
  PADDLE_WIDTH,
  BALL_SIZE,
  INITIAL_BALL_SPEED,
  PADDLE_SPEED,
  MAX_SCORE,
  PADDLE_MARGIN
} from './pongUtils';

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'SIZE' | 'SHRINK' | 'FREEZE' | 'MAGNET' | 'MULTI' | 'BALA';
  active: boolean;
}

interface PongBall {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  originalSpeed: number;
  isBullet: boolean;
  history: { x: number, y: number }[];
  lastHitBy: 'player' | 'cpu' | null;
}

type PongEvent = 
  | { type: 'BOUNCE', small?: boolean }
  | { type: 'PADDLE_HIT', side: 'player' | 'cpu', bullet: boolean }
  | { type: 'POWERUP', powerUp: string }
  | { type: 'SCORE', playerScored: boolean };

const safeVibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      (navigator as unknown as { vibrate: (p: number | number[]) => void }).vibrate(pattern);
    } catch {
      // Ignore vibration errors
    }
  }
};

const VIBRATION = {
  HIT_NORMAL: 15,
  HIT_BULLET: 40,
  GOAL_SCORE: [30, 50, 30], // Double-thump
  GOAL_FAIL: 150,           // Long pulse
  POWERUP: 20
};

export function usePongPhysics(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  playerSide: 'left' | 'right' = 'left'
) {
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [consecutiveWins, setConsecutiveWins] = useState(() => {
    return Number(localStorage.getItem('vivo_pong_consecutive_wins')) || 0;
  });

  const requestRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const keys = useRef({ up: false, down: false });

  // Assets for paddles
  const handImages = useMemo(() => {
    const izq = new Image();
    izq.src = ManoIzqLateral;
    const der = new Image();
    der.src = ManoDerLateral;
    const balaIzq = new Image();
    balaIzq.src = ManoBalaIzqLateral;
    const balaDer = new Image();
    balaDer.src = ManoBalaDerLateral;
    const bulletIcon = new Image();
    bulletIcon.src = BalaPowerupIcon;
    return { izq, der, balaIzq, balaDer, bulletIcon };
  }, []);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  useEffect(() => {
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === 5) setImagesLoaded(true);
    };

    const imgs = [handImages.izq, handImages.der, handImages.balaIzq, handImages.balaDer, handImages.bulletIcon];
    imgs.forEach(img => {
      if (img.complete) loadedCount++;
      else {
        img.onload = checkLoaded;
        img.onerror = () => console.error('Error loading Pong asset');
      }
    });

    if (loadedCount === 5) setImagesLoaded(true);
  }, [handImages]);

  // Caching tinted canvases
  const tintedAssets = useRef<{
    player?: HTMLCanvasElement;
    cpu?: HTMLCanvasElement;
    lastState?: string;
  }>({});

  // Physics state managed in a ref for performance
  const stateRef = useRef({
    playerY: (GAME_HEIGHT - PADDLE_HEIGHT) / 2,
    cpuY: (GAME_HEIGHT - PADDLE_HEIGHT) / 2,
    balls: [] as PongBall[],
    obstacles: [] as Obstacle[],
    powerUps: [] as PowerUp[],
    playerPaddleHeight: PADDLE_HEIGHT,
    cpuPaddleHeight: PADDLE_HEIGHT,
    playerFreezeTimer: 0,
    cpuFreezeTimer: 0,
    playerMagnetTimer: 0,
    cpuMagnetTimer: 0,
    playerBulletTimer: 0,
    cpuBulletTimer: 0,
    multiballTimer: 0,
    shakeIntensity: 0,
    bgOffset: 0,
    particles: [] as { x: number, y: number, vx: number, vy: number, life: number, color: string }[]
  });

  // Level Logic: Derived from Score (Goals)
  const level = score.p1 === 3 ? 3 : (score.p1 === 4 ? 4 : (score.p1 >= 5 ? 5 : 1));
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
    if (isPlaying) {
      workerRef.current?.postMessage({ type: 'UPDATE_LEVEL', payload: { level } });
    }
  }, [level, isPlaying]);

  // Initialize Worker
  useEffect(() => {
    // Create worker using a blob to avoid path issues in some environments or Vite's worker loading
    // For local dev with Vite, we use the standard constructor:
    const worker = new Worker(new URL('./pong.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, state, events } = e.data;
      if (type === 'STATE_UPDATE') {
        const s = stateRef.current;
        // Sync local ref for rendering
        s.playerY = state.playerY; // Though we mostly control this from main, worker might adjust it
        s.cpuY = state.cpuY;
        s.balls = state.balls;
        s.obstacles = state.obstacles;
        s.powerUps = state.powerUps;
        s.playerPaddleHeight = state.playerPaddleHeight;
        s.cpuPaddleHeight = state.cpuPaddleHeight;
        s.playerFreezeTimer = state.playerFreezeTimer;
        s.cpuFreezeTimer = state.cpuFreezeTimer;
        s.playerBulletTimer = state.playerBulletTimer;
        s.cpuBulletTimer = state.cpuBulletTimer;

        // Handle Events
        events.forEach((ev: PongEvent) => {
          const currentLevel = levelRef.current;
          if (ev.type === 'BOUNCE') {
            pongAudio.playBip('bounce');
            if (currentLevel >= 5) safeVibrate(ev.small ? 5 : 10);
          } else if (ev.type === 'PADDLE_HIT') {
            pongAudio.playBip('bounce');
            stateRef.current.shakeIntensity = ev.bullet ? 15 : 5;
            if (currentLevel >= 5) safeVibrate(ev.bullet ? VIBRATION.HIT_BULLET : VIBRATION.HIT_NORMAL);
          } else if (ev.type === 'POWERUP') {
            pongAudio.playBip('powerup');
            safeVibrate(VIBRATION.POWERUP);
          } else if (ev.type === 'SCORE') {
            if (ev.playerScored) {
              setScore(curr => {
                const next = { ...curr, p1: curr.p1 + 1 };
                if (next.p1 >= MAX_SCORE) {
                  setWinner('player');
                  setConsecutiveWins(w => w + 1);
                  setIsPlaying(false);
                  workerRef.current?.postMessage({ type: 'STOP' });
                }
                return next;
              });
              pongAudio.playBip('score');
              stateRef.current.shakeIntensity = 10;
              if (currentLevel >= 5) safeVibrate(VIBRATION.GOAL_SCORE);
            } else {
              setScore(curr => {
                const next = { ...curr, p2: curr.p2 + 1 };
                if (next.p2 >= MAX_SCORE) {
                  setWinner('cpu');
                  setConsecutiveWins(0);
                  setIsPlaying(false);
                  workerRef.current?.postMessage({ type: 'STOP' });
                }
                return next;
              });
              pongAudio.playBip('fail');
              stateRef.current.shakeIntensity = 10;
              if (currentLevel >= 5) safeVibrate(VIBRATION.GOAL_FAIL);
            }
          }
        });
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []); // Only init once

  // Persistence: Save state to localStorage
  useEffect(() => {
    if (isPlaying && score.p1 < MAX_SCORE && score.p2 < MAX_SCORE) {
      localStorage.setItem('vivo_pong_current_match', JSON.stringify({
        score,
        playerSide,
        level,
        consecutiveWins
      }));
    } else if (winner) {
      localStorage.removeItem('vivo_pong_current_match');
    }
  }, [score, playerSide, level, isPlaying, winner, consecutiveWins]);

  const hasSavedGame = useMemo(() => {
    return !!localStorage.getItem('vivo_pong_current_match');
  }, []);

  const resumeGame = () => {
    const saved = localStorage.getItem('vivo_pong_current_match');
    if (saved) {
      const data = JSON.parse(saved);
      setScore(data.score);
      setWinner(null);
      setIsPlaying(true);
      setIsPaused(false);
      
      // Notify Worker
      workerRef.current?.postMessage({ 
        type: 'START', 
        payload: { 
          playerSide: data.playerSide, 
          level: data.level 
        } 
      });
    }
  };

  // Persist consecutive wins logic
  useEffect(() => {
    localStorage.setItem('vivo_pong_consecutive_wins', consecutiveWins.toString());
  }, [consecutiveWins]);

  // resetBall, spawnPowerUp, resetGame, and spawnObstacles now live in the Worker.
  // We keep the RENDERING loop on the main thread.

  const startGame = () => {
    setScore({ p1: 0, p2: 0 });
    setWinner(null);
    setIsPlaying(true);
    setIsPaused(false);
    
    // Notify Worker
    workerRef.current?.postMessage({ 
      type: 'START', 
      payload: { playerSide, level } 
    });
  };


    const loop = useCallback(() => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // LOCAL-ONLY RENDERING EFFECTS (Shake & Particles)
    if (state.shakeIntensity > 0) {
      state.shakeIntensity *= 0.9;
      if (state.shakeIntensity < 0.1) state.shakeIntensity = 0;
    }

    state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    state.particles = state.particles.filter(p => p.life > 0);

    // Sync Player Movement to Worker
    if (isPlaying && !isPaused && state.playerFreezeTimer <= 0) {
        let changed = false;
        if (keys.current.up) {
            state.playerY = Math.max(0, state.playerY - PADDLE_SPEED);
            changed = true;
        }
        if (keys.current.down) {
            state.playerY = Math.min(GAME_HEIGHT - state.playerPaddleHeight, state.playerY + PADDLE_SPEED);
            changed = true;
        }
        if (changed) {
            workerRef.current?.postMessage({ 
                type: 'UPDATE_PADDLE', 
                payload: { y: state.playerY } 
            });
        }
    }

    // 2. Clear & Background
    ctx.fillStyle = '#0f172a'; // Deep Navy
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Dynamic Background Grid
    const activeBall = state.balls[0];
    const ballSpeed = activeBall?.speed || INITIAL_BALL_SPEED;
    state.bgOffset = (state.bgOffset + ballSpeed * 0.2) % 100;

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 1;
    for (let x = -state.bgOffset; x < GAME_WIDTH + 100; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < GAME_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    // Draw Net
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Particles Rendering
    state.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1.0;

    // Boundary Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 2); ctx.lineTo(GAME_WIDTH, 2);
    ctx.moveTo(0, GAME_HEIGHT - 2); ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - 2);
    ctx.stroke();

    // 3. Obstacles
    state.obstacles.forEach(obs => {
      if (!obs.active) return;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    // 3b. Power-ups
    state.powerUps.forEach(p => {
      if (!p.active) return;
      const color = p.type === 'SIZE' ? '#22c55e' : (p.type === 'SHRINK' ? '#ef4444' : (p.type === 'FREEZE' ? '#3b82f6' : (p.type === 'MAGNET' ? '#f59e0b' : (p.type === 'BALA' ? '#f59e0b' : '#3b82f6'))));
      
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      if (p.type === 'BALA' && imagesLoaded) {
          ctx.drawImage(handImages.bulletIcon, p.x - 10, p.y - 10, 20, 20);
      } else {
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.font = 'bold 16px Arial';
          const label = p.type === 'SIZE' ? '+' : (p.type === 'SHRINK' ? '-' : (p.type === 'FREEZE' ? '❄️' : (p.type === 'MAGNET' ? 'U' : (p.type === 'MULTI' ? '2' : ''))));
          ctx.fillText(label, p.x, p.y + 6);
      }
    });

    // 4. Draw Paddles
    if (imagesLoaded) {
      const playerIsBullet = state.playerBulletTimer > 0;
      const cpuIsBullet = state.cpuBulletTimer > 0;
      const playerColor = state.playerFreezeTimer > 0 ? '#94a3b8' : (playerSide === 'left' ? '#22d3ee' : '#e879f9');
      const cpuColor = state.cpuFreezeTimer > 0 ? '#94a3b8' : (playerSide === 'left' ? '#e879f9' : '#22d3ee');
      const currentStateKey = `${playerSide}-${playerColor}-${cpuColor}-${playerIsBullet}-${cpuIsBullet}`;

      if (tintedAssets.current.lastState !== currentStateKey) {
        const playerHandImg = playerSide === 'left' 
          ? (playerIsBullet ? handImages.balaIzq : handImages.izq) 
          : (playerIsBullet ? handImages.balaDer : handImages.der);
        const cpuHandImg = playerSide === 'left' 
          ? (cpuIsBullet ? handImages.balaDer : handImages.der)
          : (cpuIsBullet ? handImages.balaIzq : handImages.izq);
        
        tintedAssets.current.player = tintImage(playerHandImg, playerColor);
        tintedAssets.current.cpu = tintImage(cpuHandImg, cpuColor);
        tintedAssets.current.lastState = currentStateKey;
      }

      const drawP = (x: number, y: number, h: number, asset: HTMLCanvasElement, side: 'left' | 'right') => {
        const ratio = asset.width / asset.height;
        const w = h * ratio;
        const finalX = side === 'left' ? x : x - (w - PADDLE_WIDTH);
        ctx.drawImage(asset, finalX, y, w, h);
      };

      if (tintedAssets.current.player) {
          const pX = playerSide === 'left' ? PADDLE_MARGIN : GAME_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH;
          drawP(pX, state.playerY, state.playerPaddleHeight, tintedAssets.current.player, playerSide);
      }
      if (tintedAssets.current.cpu) {
          const cX = playerSide === 'left' ? GAME_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH : PADDLE_MARGIN;
          drawP(cX, state.cpuY, state.cpuPaddleHeight, tintedAssets.current.cpu, playerSide === 'left' ? 'right' : 'left');
      }
    }

    // 5. Balls & Trails
    state.balls.forEach(ball => {
      // Trail
      ball.history.forEach((pos, i) => {
        const alpha = (i + 1) / ball.history.length;
        ctx.fillStyle = ball.dx > 0 ? `rgba(34, 211, 238, ${alpha * 0.3})` : `rgba(232, 121, 249, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, (BALL_SIZE / 2) * alpha, 0, Math.PI * 2);
        ctx.fill();
      });

      // Spawn Bullet sparks (Local only)
      if (ball.isBullet) {
        for (let i = 0; i < 2; i++) {
          state.particles.push({
            x: ball.x, y: ball.y,
            vx: -ball.dx * (Math.random() * 5),
            vy: (Math.random() - 0.5) * 4,
            life: 1.0, color: ball.dx > 0 ? '#22d3ee' : '#e879f9'
          });
        }
      }

      // Render Ball
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_SIZE / 2, 0, Math.PI * 2); ctx.fill();
    });

    requestRef.current = requestAnimationFrame(loop);
  }, [isPlaying, isPaused, playerSide, imagesLoaded, handImages, canvasRef]);


  // Game Loop Lifecycle
  useEffect(() => {
    if (isPlaying && !isPaused) {
      requestRef.current = requestAnimationFrame(loop);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isPaused, loop]);

  // Input Listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') keys.current.up = true;
      if (e.key === 'ArrowDown') keys.current.down = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') keys.current.up = false;
      if (e.key === 'ArrowDown') keys.current.down = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const handleTouchY = useCallback((y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = GAME_HEIGHT / rect.height;
    const gameY = (y - rect.top) * scaleY;
    
    // Update either player or cpu Y based on who is controlled (but here player always controls 'playerY')
    const newY = Math.max(0, Math.min(GAME_HEIGHT - stateRef.current.playerPaddleHeight, gameY - stateRef.current.playerPaddleHeight / 2));
    if (newY !== stateRef.current.playerY) {
        stateRef.current.playerY = newY;
        workerRef.current?.postMessage({ 
            type: 'UPDATE_PADDLE', 
            payload: { y: newY } 
        });
    }
  }, [canvasRef]);

  const togglePause = useCallback(() => setIsPaused(p => !p), []);

  const shakeOffset = {
    x: (Math.random() - 0.5) * stateRef.current.shakeIntensity,
    y: (Math.random() - 0.5) * stateRef.current.shakeIntensity
  };

  return { 
    startGame, resumeGame, hasSavedGame, score, winner, isPlaying, isPaused, togglePause, 
    level, consecutiveWins, handleTouchY, shakeOffset 
  };
}

