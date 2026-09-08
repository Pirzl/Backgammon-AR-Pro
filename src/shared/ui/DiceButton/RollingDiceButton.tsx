import { useEffect, useRef } from 'react';
import type * as THREE_NS from 'three';

type Three = typeof THREE_NS;

type Props = {
  /** When true the button is not clickable (e.g. dice already rolled, not your turn). */
  disabled?: boolean;
  /** Called after the roll animation finishes. The game decides the real dice values. */
  onRoll?: () => void;
  className?: string;
};

// === die face logic (mirrors the verified dice3d-test demo) =====================
// local frame: +Y is the visible/top face when quaternion = identity.
// Standard die: opposite faces sum to 7; value on +Y (top).
const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
type FaceKey = (typeof FACE_KEYS)[number];
const ORDER: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

const p1: [number, number][] = [[0.5, 0.5]];
const p2: [number, number][] = [[0.27, 0.27], [0.73, 0.73]];
const p3: [number, number][] = [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]];
const p4: [number, number][] = [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]];
const p5: [number, number][] = [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [0.25, 0.75], [0.75, 0.25]];
const p6: [number, number][] = [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]];
const pipPositions: Record<number, [number, number][]> = { 1: p1, 2: p2, 3: p3, 4: p4, 5: p5, 6: p6 };

function buildDieMaterials(THREE: Three, value: number): THREE_NS.MeshStandardMaterial[] {
  const v = value;
  const b = 7 - v;
  const rem = [1, 2, 3, 4, 5, 6].filter((n) => n !== v && n !== b);
  const pairA = [rem[0]!, 7 - rem[0]!];
  const pairB = [rem[1]!, 7 - rem[1]!];
  const faces: Record<FaceKey, number> = {
    px: pairA[0]!, nx: pairA[1]!,
    py: v, ny: b,
    pz: pairB[0]!, nz: pairB[1]!,
  };
  return ORDER.map((k) => {
    const val = faces[k] as number;
    const poss = pipPositions[val] ?? p1;
    return new THREE.MeshStandardMaterial({ map: makeFaceTexture(THREE, poss), roughness: 0.4, metalness: 0.05 });
  });
}

function makeFaceTexture(THREE: Three, positions: [number, number][]): THREE_NS.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0f172a';
  const r = size * 0.09;
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function faceUpQuaternion(THREE: Three): THREE_NS.Quaternion {
  // value on +Y → identity (die built with +Y = value)
  return new THREE.Quaternion();
}

// === component ================================================================
export function RollingDiceButton({ disabled = false, onRoll, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const rollingRef = useRef(false);
  const onRollRef = useRef(onRoll);
  onRollRef.current = onRoll;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import('three');
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
      camera.position.set(0, 0, 3);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(2, 3, 4);
      scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
      dir2.position.set(-2, -1, 2);
      scene.add(dir2);

      const geo = new THREE.BoxGeometry(1, 1, 1);
      const dice: THREE_NS.Mesh[] = [];
      const startValues = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      for (let i = 0; i < 2; i++) {
        const mats = buildDieMaterials(THREE, startValues[i]!);
        const die = new THREE.Mesh(geo, mats);
        die.position.x = i === 0 ? -0.6 : 0.6;
        die.position.y = (Math.random() - 0.5) * 0.4;
        dice.push(die);
        scene.add(die);
      }

      const spin = dice.map(() => ({
        x: (Math.random() - 0.5) * 14,
        y: (Math.random() - 0.5) * 14,
      }));

      const resize = () => {
        const w = container!.clientWidth || 64;
        const h = container!.clientHeight || 44;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      const bounce = (t: number) => Math.max(0, Math.sin(t * Math.PI) * Math.exp(-2.2 * t));

      const animateRoll = () => {
        if (rollingRef.current) return;
        rollingRef.current = true;
        const start = performance.now();
        const dur = 1600;
        const targets = dice.map(() => faceUpQuaternion(THREE));
        const step = (now: number) => {
          const t = (now - start) / 1000;
          const k = Math.min(1, t / (dur / 1000));
          for (let i = 0; i < dice.length; i++) {
            const d = dice[i]!;
            const s = spin[i]!;
            d.rotation.x = s.x * k * 6;
            d.rotation.y = s.y * k * 6;
            d.position.y = bounce(t) * 0.9;
          }
          if (k < 1) {
            animRef.current = requestAnimationFrame(step);
          } else {
            for (let i = 0; i < dice.length; i++) {
              const d = dice[i]!;
              d.quaternion.copy(targets[i]!);
              d.position.y = 0;
            }
            rollingRef.current = false;
            onRollRef.current?.();
          }
        };
        animRef.current = requestAnimationFrame(step);
      };
      (container as any).__roll = animateRoll;

      const loop = () => {
        if (disposed) return;
        renderer.render(scene, camera);
        animRef.current = requestAnimationFrame(loop);
      };
      loop();

      cleanup = () => {
        ro.disconnect();
        geo.dispose();
        dice.forEach((d) => (d.material as THREE_NS.Material[]).forEach((m) => m.dispose()));
        renderer.dispose();
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const handleClick = () => {
    if (disabled || rollingRef.current) return;
    const el = containerRef.current as any;
    if (el && typeof el.__roll === 'function') el.__roll();
    else onRoll?.(); // fallback: still fire the roll
  };

  return (
    <button
      id="btn-dado"
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label="Tirar dados"
      className={
        'group relative flex select-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-yellow-200 ' +
        'bg-yellow-400 px-3 py-2 shadow-2xl transition active:scale-95 ' +
        'hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 ' +
        'overflow-visible ' +
        className
      }
    >
      {/* spacer so the button keeps a min height even though the canvas is absolute */}
      <div className="h-[clamp(46px,9vw,64px)] w-full" aria-hidden />
      {/* 3D dice canvas — floats ABOVE the yellow background (z-30), allowed to overflow.
          pointer-events-none so clicks pass through to the button. */}
      <div
        ref={containerRef}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 'clamp(64px, 14vw, 96px)', height: 'clamp(46px, 9vw, 64px)', zIndex: 30 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      <span className="relative z-10 whitespace-nowrap text-[11px] font-extrabold leading-tight text-slate-900 sm:text-sm lg:text-base">
        Tirar
      </span>
    </button>
  );
}

export default RollingDiceButton;
