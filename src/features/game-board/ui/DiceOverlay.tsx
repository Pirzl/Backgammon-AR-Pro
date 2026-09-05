import { useEffect, useRef } from 'react';
import type * as THREE_NS from 'three';
import type { GameState } from '../model/types';
import type { BoardGeometry } from '../lib/useBoardGeometry';

type Three = typeof THREE_NS;

interface DiceOverlayProps {
  /** Real measured board geometry (px per point, from Board's useBoardGeometry). */
  geometry: BoardGeometry | undefined;
  state: GameState;
}

// === die face logic (DiceOverlay convention — DIFFERENT from RollingDiceButton!) ===
// DiceOverlay's camera is LEVEL at (0,0,dist) looking at the felt, so the face the
// player READS is +Z (toward camera), not +Y. The rolled value must be on +Z at rest
// (identity quaternion), with its opposite 7-v on -Z. Side pairs fill the remaining axes.
const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
type FaceKey = (typeof FACE_KEYS)[number];
const ORDER: FaceKey[] = [...FACE_KEYS];

const p1: [number, number][] = [[0.5, 0.5]];
const p2: [number, number][] = [[0.27, 0.27], [0.73, 0.73]];
const p3: [number, number][] = [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]];
const p4: [number, number][] = [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]];
const p5: [number, number][] = [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [0.25, 0.75], [0.75, 0.25]];
const p6: [number, number][] = [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]];
const pipPositions: Record<number, [number, number][]> = { 1: p1, 2: p2, 3: p3, 4: p4, 5: p5, 6: p6 };

function buildDieMaterials(THREE: Three, value: number, isWhiteTurn: boolean): THREE_NS.MeshStandardMaterial[] {
  const v = value;
  const b = 7 - v;
  const rem = [1, 2, 3, 4, 5, 6].filter((n) => n !== v && n !== b);
  const pairA = [rem[0]!, 7 - rem[0]!];
  const pairB = [rem[1]!, 7 - rem[1]!];
  // Value on +Z (pz): the face that points at DiceOverlay's LEVEL camera at rest.
  const faces: Record<FaceKey, number> = {
    px: pairA[0]!, nx: pairA[1]!,
    py: pairB[0]!, ny: pairB[1]!,
    pz: v, nz: b,
  };
  return ORDER.map((k) => {
    const val = faces[k] as number;
    const poss = pipPositions[val] ?? p1;
    return new THREE.MeshStandardMaterial({
      map: makeFaceTexture(THREE, poss, isWhiteTurn),
      roughness: 0.4,
      metalness: 0.05,
    });
  });
}

function makeFaceTexture(THREE: Three, positions: [number, number][], isWhiteTurn: boolean): THREE_NS.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  if (isWhiteTurn) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);
  } else {
    // RUBY RED BASE — same radial gradient as the black checkers (Checker.tsx),
    // so the red dice match the red/black pieces instead of the pale #dc2626.
    const g = ctx.createRadialGradient(size * 0.3, size * 0.3, size * 0.05, size * 0.3, size * 0.3, size);
    g.addColorStop(0, '#990000');
    g.addColorStop(0.5, '#550000');
    g.addColorStop(1, '#220000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = isWhiteTurn ? '#0f172a' : '#ffffff';
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

/** Rotates a die so the requested value faces +Z (toward DiceOverlay's LEVEL camera). */
function faceUpQuaternion(THREE: Three, value: number): THREE_NS.Quaternion {
  const v = value;
  const b = 7 - v;
  // value v -> +Z (pz), its opposite b -> -Z (nz)
  const rem = [1, 2, 3, 4, 5, 6].filter((n) => n !== v && n !== b);
  const pairA = [rem[0]!, 7 - rem[0]!];
  const pairB = [rem[1]!, 7 - rem[1]!];
  const faces: Record<FaceKey, number> = {
    px: pairA[0]!, nx: pairA[1]!,
    py: pairB[0]!, ny: pairB[1]!,
    pz: v, nz: b,
  };
  const q = new THREE.Quaternion();
  for (const axis of ORDER) {
    const val = faces[axis] as number;
    if (val !== v) continue;
    // Face axis mapping: px=+X, nx=-X, py=+Y, ny=-Y, pz=+Z, nz=-Z
    const dir = axis.endsWith('x') ? [1, 0, 0] : axis.endsWith('y') ? [0, 1, 0] : [0, 0, 1];
    const sign = axis.startsWith('n') ? -1 : 1;
    const target = new THREE.Vector3(dir[0]! * sign, dir[1]! * sign, dir[2]! * sign);
    q.setFromUnitVectors(target, new THREE.Vector3(0, 0, 1));
    break;
  }
  return q;
}

/**
 * Landing zone center (px, relative to the board container), derived from the REAL
 * measured geometry of the 24 points only (BAR/OFF ids 26-29 excluded).
 *
 * Obsidian spec: dice rest in the central-left felt strip ("franja central entre filas"),
 * as a RELATIVE zone — NOT fixed point ids — so it survives H2H mirror / rotation
 * (board-settings-changed re-measures geometry; we always read the CURRENT layout).
 *
 * Non-doubles (2 dice) sit at ~62% of the left half; doubles (4 dice) at ~72% (closer to
 * the bar, where there is more empty felt room), per the prototype zoneCenterX=-2.2.
 */
function computeZoneCenter(
  geometry: BoardGeometry | undefined,
  container: HTMLDivElement | null,
  diceCount: number
): { x: number; y: number } {
  const rect = container?.getBoundingClientRect();
  const fallback = { x: (rect?.width ?? 800) * 0.28, y: (rect?.height ?? 500) * 0.5 };
  if (!geometry || !rect || rect.width === 0) return fallback;

  // Only the 24 triangles (1-24); skip bar (26/27) and off trays (28/29).
  const pts = Object.entries(geometry)
    .map(([k, g]) => ({ id: Number(k), g }))
    .filter((p) => p.id >= 1 && p.id <= 24 && typeof p.g?.cx === 'number')
    .map((p) => p.g);
  if (pts.length < 4) return fallback;

  const avgY = (arr: typeof pts) => arr.reduce((s, p) => s + p.cy, 0) / (arr.length || 1);

  // Split into top row vs bottom row by cy (board top = smaller cy).
  const sorted = [...pts].sort((a, b) => a.cy - b.cy);
  const half = Math.floor(sorted.length / 2);
  const topRow = sorted.slice(0, half);
  const bottomRow = sorted.slice(half);

  // Middle band between the two point rows = where dice rest.
  const zoneY = (avgY(topRow) + avgY(bottomRow)) / 2;

  const minX = Math.min(...pts.map((p) => p.cx));
  const maxX = Math.max(...pts.map((p) => p.cx));
  const barX = (minX + maxX) / 2; // center column of the board

  // Left visual quadrant: from minX (left edge) to barX.
  const leftW = barX - minX;
  const zoneX = minX + leftW * (diceCount >= 3 ? 0.72 : 0.62);

  return {
    x: Math.max(30, Math.min(rect.width - 30, zoneX)),
    y: Math.max(30, Math.min(rect.height - 30, zoneY)),
  };
}

/**
 * DiceOverlay — 3D dice that land in the central-left felt zone of the board after a roll.
 *
 * Consumes the REAL measured geometry (px per point) that Board already computes, so dice
 * positions survive H2H mirror / board rotation (board-settings-changed re-measures).
 */
export function DiceOverlay({ geometry, state }: DiceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastRollKeyRef = useRef('');

  const diceValues = state.dice ?? [];
  const usedValues = state.usedDice ?? [];
  const isWhiteTurn = state.turn === 'white';
  const rollKey = `${diceValues.join(',')}|${state.turn}`;
  const usedKey = usedValues.join(',');

  // Compact geometry fingerprint: re-runs when a re-measure happens (H2H mirror/rotation).
  const geomKey = geometry
    ? Object.keys(geometry).length + ':'
      + Math.round((geometry[15]?.cx ?? 0) * 10) + ','
      + Math.round((geometry[15]?.cy ?? 0) * 10)
    : 'none';
  const key = `${rollKey}|${usedKey}|${geomKey}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement as HTMLDivElement | null;
    if (!canvas || !container) return;
    if (diceValues.length === 0) return;

    const isFreshRoll = lastRollKeyRef.current !== rollKey;
    lastRollKeyRef.current = rollKey;

    // used-count per value (dim dice that were already played this turn)
    const usedCounts: Record<number, number> = {};
    usedValues.forEach((d) => { usedCounts[d] = (usedCounts[d] || 0) + 1; });

    let disposed = false;

    (async () => {
      const THREE = await import('three');
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(2, 3, 4);
      scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
      dir2.position.set(-2, -1, 2);
      scene.add(dir2);

      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const n = diceValues.length;
      const zone = computeZoneCenter(geometry, container, n);

      // === On-screen die size MUST match RollingDiceButton (user verdict) =========
      // RollingDiceButton renders 1.0 world-unit cubes through PerspectiveCamera(43,1)
      // at z=3. Visible world height at that distance = 2*3*tan(21.5deg) ≈ 2.3635 units,
      // drawn onto its canvas height clamp(46px,9vw,64px) → px/unit = hBtn / 2.3635.
      // We reproduce that SAME px/unit over the (larger) board canvas by placing our
      // camera at dist = 3 * hBoard / hBtn, so 1 world unit maps to hBtn/2.3635 px —
      // pixel-identical die size to the button dice. (Old code placed dice with
      // scale = hPx/8 but rendered with a z=3.4 frustum ≈ hPx/2.68 px/unit → ~4-5x too big.)
      const FOV = 43;
      const BUTTON_CAM_DIST = 3; // RollingDiceButton camera distance
      const visibleAtBtnDist = 2 * BUTTON_CAM_DIST * Math.tan((FOV / 2) * (Math.PI / 180)); // ≈2.3635
      const hBtn = Math.min(64, Math.max(46, window.innerWidth * 0.09)); // clamp(46px,9vw,64px)

      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
      const resize = () => {
        const w = container.clientWidth || 320;
        const h = container.clientHeight || 240;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      const wPx = container.clientWidth || 320;
      const hPx = container.clientHeight || 240;
      const pxPerUnit = hBtn / visibleAtBtnDist; // px per world unit — equals the button's
      const dist = BUTTON_CAM_DIST * (hPx / hBtn); // widen frustum over the board canvas
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);

      const dieEdge = 1.0; // same world-unit edge as the button die
      const spacing = dieEdge * 1.2; // center-to-center; button centers are ±0.6 (1.2 apart)
      const totalW = dieEdge + (n - 1) * spacing;

      // Felt-zone px → world coords using the SAME px/unit as the render scale.
      // Screen center = world (0,0). +Y world = up on screen, +X world = right.
      const worldX = (zone.x - wPx / 2) / pxPerUnit;
      const worldY = (hPx / 2 - zone.y) / pxPerUnit;


      const dice: THREE_NS.Mesh[] = [];
      for (let i = 0; i < n; i++) {
        const val = diceValues[i] ?? 1;
        const usedCount = usedCounts[val] || 0;
        const isUsed = usedCount > 0;
        if (isUsed) usedCounts[val] = usedCount - 1;

        const mats = buildDieMaterials(THREE, val, isWhiteTurn);
        // Used dice: keep them OPAQUE (they were see-through at 0.3 opacity — the
        // dice read as "slightly transparent red"). Dim via material color instead:
        // a darker shade still signals "already played" without alpha blending.
        if (isUsed) mats.forEach((m) => { m.color.setHex(0x777777); });
        const die = new THREE.Mesh(boxGeo, mats);
        const x = worldX - totalW / 2 + dieEdge / 2 + i * spacing;
        die.position.set(x, isFreshRoll ? worldY + 2.8 : worldY, 0);
        die.quaternion.copy(faceUpQuaternion(THREE, val));
        die.scale.setScalar(dieEdge);
        dice.push(die);
        scene.add(die);
      }

      const bounce = (t: number) => Math.max(0, Math.sin(t * Math.PI) * Math.exp(-2.2 * t));

      // Drop from above on a fresh roll; otherwise just stay at rest.
      if (isFreshRoll) {
        const start = performance.now();
        const dur = 900;
        const step = (now: number) => {
          if (disposed) return;
          const t = (now - start) / dur;
          const k = Math.min(1, t);
          dice.forEach((d, i) => {
            d.position.y = worldY + 2.8 * (1 - k) + bounce(k) * 0.5;
            d.rotation.x += 0.06 * (i % 2 === 0 ? 1 : -1);
            d.rotation.y += 0.04;
          });
          renderer.render(scene, camera);
          if (k < 1) animRef.current = requestAnimationFrame(step);
          else {
            dice.forEach((d, i) => {
              d.position.y = worldY;
              d.quaternion.copy(faceUpQuaternion(THREE, diceValues[i] ?? 1));
            });
            renderer.render(scene, camera);
          }
        };
        animRef.current = requestAnimationFrame(step);
      }

      const loop = () => {
        if (disposed) return;
        renderer.render(scene, camera);
        animRef.current = requestAnimationFrame(loop);
      };
      // Start idle loop only after any drop animation finishes.
      const idleTimer = window.setTimeout(() => {
        if (disposed) return;
        loop();
      }, isFreshRoll ? 1100 : 0);

      cleanupRef.current = () => {
        ro.disconnect();
        if (animRef.current !== null) cancelAnimationFrame(animRef.current);
        clearTimeout(idleTimer);
        boxGeo.dispose();
        dice.forEach((d) => {
          const mats = Array.isArray(d.material) ? d.material : [d.material];
          mats.forEach((m) => m.dispose());
        });
        renderer.dispose();
        cleanupRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const show = diceValues.length > 0 && !state.winner;
  if (!show) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[45]"
      style={{ width: '100%', height: '100%' }}
      aria-hidden
    />
  );
}

export default DiceOverlay;