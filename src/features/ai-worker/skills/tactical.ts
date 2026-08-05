/**
 * TACTICAL SKILLS (Block 3 — Táctico)
 *
 * These formalise the field heuristics that previously lived inline in
 * expectimax.ts. Each is now a self-contained, registered skill the executor
 * dispatches to in priority order.
 *
 * Implemented here:
 *   • SK-07 Blot Prevention
 *   • SK-08 Blocks & Covers (prime making)
 *   • SK-09 Hit or Pass
 *   • SK-10 Optimized Bear-off
 *   • SK-14 Bar Lockdown
 *   • SK-16 Landing Efficiency
 *
 * The numeric results mirror the original helpers so engine strength is
 * unchanged; the win is that skills are now selectable/prioritised.
 */

import {
  applyMove,
  getBarIndex,
  getOffIndex,
  getHomeBoard,
  getDirection,
  allCheckersHome,
} from '../../../entities/game/rules';
import type { Move, PlayerColor } from '../../../entities/game/types';
import { registerSkill } from './registry';
import type { TacticalSkill } from './types';

const sign = (p: PlayerColor) => (p === 'white' ? 1 : -1);

// ─── SK-07 Blot Prevention ──────────────────────────────────────────────────
const sk07: TacticalSkill = {
  id: 'SK-07',
  block: 'tactician',
  kind: 'tactical',
  applies: (_m, ctx) => !allCheckersHome(ctx.board, ctx.aiColor),
  score: (move, ctx) => {
    const w = ctx.weights!;
    const after = applyMove(ctx.board, move, ctx.aiColor);
    const myRisk = blotRiskFor(after, ctx.aiColor);
    // SK-15 scales blot weight up to +30% against aggressive humans.
    const scale = ctx.profile?.label === 'agresivo' ? 1.3 : 1.0;
    return -myRisk * w.blotRisk * scale;
  },
};
registerSkill(sk07);

// ─── SK-08 Blocks & Covers ──────────────────────────────────────────────────
const sk08: TacticalSkill = {
  id: 'SK-08',
  block: 'tactician',
  kind: 'tactical',
  applies: () => true,
  score: (move, ctx) => {
    const w = ctx.weights!;
    const before = primeScore(ctx.board, ctx.aiColor);
    const after = primeScore(applyMove(ctx.board, move, ctx.aiColor), ctx.aiColor);
    return (after - before) * w.prime;
  },
};
registerSkill(sk08);

// ─── SK-09 Hit or Pass ──────────────────────────────────────────────────────
const sk09: TacticalSkill = {
  id: 'SK-09',
  block: 'tactician',
  kind: 'tactical',
  applies: (move, ctx) => {
    const target = ctx.board[move.to] ?? 0;
    // Only a hit if destination had exactly one opponent checker.
    return Math.abs(target) === 1 && Math.sign(target) !== sign(ctx.aiColor);
  },
  score: (move, ctx) => {
    const w = ctx.weights!;
    const opp = ctx.aiColor === 'white' ? 'black' : 'white';
    const myHome = countHomePoints(ctx.board, ctx.aiColor);
    let bonus = w.hitBonus;
    // Reckless-hit dampening: if we'd expose many blots, value the hit less.
    const riskAfter = blotRiskFor(applyMove(ctx.board, move, ctx.aiColor), ctx.aiColor);
    if (riskAfter > 2) bonus *= 0.4;
    else if (riskAfter > 1) bonus *= 0.75;
    bonus *= 0.7 + (myHome / 6) * 0.8; // closed home → hit is worth more
    // SK-09 "or pass": extra value when opponent is on the bar.
    const oppBarIdx = getBarIndex(opp);
    if (Math.abs(ctx.board[oppBarIdx] ?? 0) > 0) bonus += w.barReward * 0.5;
    return bonus;
  },
};
registerSkill(sk09);

// ─── SK-10 Optimized Bear-off ───────────────────────────────────────────────
const sk10: TacticalSkill = {
  id: 'SK-10',
  block: 'tactician',
  kind: 'tactical',
  applies: (move) => isOffDestination(move),
  score: (_move, ctx) => {
    const w = ctx.weights!;
    return w.bearOff;
  },
};
registerSkill(sk10);

// ─── SK-14 Bar Lockdown ─────────────────────────────────────────────────────
const sk14: TacticalSkill = {
  id: 'SK-14',
  block: 'tactician',
  kind: 'tactical',
  applies: (_m, ctx) => {
    const opp = ctx.aiColor === 'white' ? 'black' : 'white';
    return Math.abs(ctx.board[getBarIndex(opp)] ?? 0) > 0;
  },
  score: (move, ctx) => {
    const w = ctx.weights!;
    const after = applyMove(ctx.board, move, ctx.aiColor);
    const myHome = countHomePoints(after, ctx.aiColor);
    return myHome * w.homeBoard; // more closed points = harder for opp to enter
  },
};
registerSkill(sk14);

// ─── SK-16 Landing Efficiency ───────────────────────────────────────────────
// "If a die equals the source point and we can bear off, +15."
const sk16: TacticalSkill = {
  id: 'SK-16',
  block: 'tactician',
  kind: 'tactical',
  applies: (move, ctx) =>
    allCheckersHome(ctx.board, ctx.aiColor) &&
    move.to === getOffIndex(ctx.aiColor),
  score: (move, ctx) => {
    const w = ctx.weights!;
    const home = getHomeBoard(ctx.aiColor);
    // Source point in the player's own frame (1..6 for white, mirrored for black).
    const srcPoint = ctx.aiColor === 'white' ? move.from : 25 - move.from;
    const inHome = srcPoint >= home[0] && srcPoint <= home[1];
    if (inHome && move.die === srcPoint) return w.bearOffExactDie; // +15
    return 0;
  },
};
registerSkill(sk16);

// ─── helpers (lifted from expectimax.ts semantics) ──────────────────────────

function isOffDestination(move: Move): boolean {
  // SK-10 fires when the destination is either off slot (28/29).
  return move.to === 28 || move.to === 29;
}

function blotRiskFor(board: number[], player: PlayerColor): number {
  const s = sign(player);
  const dir = getDirection(player);
  const opp = player === 'white' ? 'black' : 'white';
  const oppBar = getBarIndex(opp);
  const oppBarCount = Math.abs(board[oppBar] ?? 0);
  let score = 0;
  for (let i = 1; i <= 24; i++) {
    const c = board[i] ?? 0;
    const isBlot = (s > 0 && c === 1) || (s < 0 && c === -1);
    if (!isBlot) continue;
    for (let pip = 1; pip <= 6; pip++) {
      const idx = i + dir * pip;
      if (idx < 1 || idx > 24) continue;
      const t = board[idx] ?? 0;
      if ((s > 0 && t < 0) || (s < 0 && t > 0)) score += 0.35 + (6 - pip) * 0.12;
    }
    if (oppBarCount > 0) {
      if (player === 'white' && i >= 1 && i <= 6) score += 0.6;
      if (player === 'black' && i >= 19 && i <= 24) score += 0.6;
    }
  }
  return score;
}

function primeScore(board: number[], player: PlayerColor): number {
  const s = sign(player);
  let score = 0;
  let run = 0;
  for (let i = 1; i <= 24; i++) {
    const c = board[i] ?? 0;
    const owned = (s > 0 && c >= 2) || (s < 0 && c <= -2);
    if (owned) run++;
    else {
      if (run >= 3) score += primeLookup(run);
      run = 0;
    }
  }
  if (run >= 3) score += primeLookup(run);
  return score;
}

function primeLookup(n: number): number {
  if (n === 3) return 0.6;
  if (n === 4) return 1.5;
  if (n === 5) return 2.8;
  return 5.0 + (n - 6) * 1.5;
}

function countHomePoints(board: number[], player: PlayerColor): number {
  const [start, end] = getHomeBoard(player);
  const s = sign(player);
  let pts = 0;
  for (let i = start; i <= end; i++) {
    const c = board[i] ?? 0;
    if ((s > 0 && c >= 2) || (s < 0 && c <= -2)) pts++;
  }
  return pts;
}
