/**
 * SELECTOR SKILLS (Block 2 — Estratega)
 *
 * Decide WHICH tactical skills fire and with what priority/multiplier, based
 * on the global picture (pip count, game phase).
 *
 *   • SK-05 Win-Drive  — race vs. prime game → reweights risk/prime
 *   • SK-06 Timeline Scanner — phase detection (contact / race / bear-off)
 *
 * Combined with ExecutionAgent.planForContext, these become the "priority"
 * layer the user asked for: the AI picks a plan first, then runs the matching
 * skills with amplified weights.
 */

import { getBarIndex, getHomeBoard, allCheckersHome } from '../../../entities/game/rules';
import { registerSkill } from './registry';
import type { SkillContext, SkillId } from './types';

type Pick = { id: SkillId; multiplier: number };

// ─── SK-05 Win-Drive ─────────────────────────────────────────────────────────
registerSkill({
  id: 'SK-05',
  block: 'strategist',
  kind: 'selector',
  priority: 100, // master switch — runs first
  select: (ctx: SkillContext): Pick[] => {
    const aiPip = pipCount(ctx.board, ctx.aiColor);
    const oppPip = pipCount(ctx.board, ctx.aiColor === 'white' ? 'black' : 'white');
    const winning = aiPip < oppPip;

    const picks: Pick[] = [];
    if (winning) {
      // Winning the race → play safe. Boost blot prevention, ease off prime.
      picks.push({ id: 'SK-07', multiplier: 1.3 });
      picks.push({ id: 'SK-10', multiplier: 1.2 }); // bear off promptly
      picks.push({ id: 'SK-08', multiplier: 0.8 });
    } else {
      // Losing → build advanced blocks to trap the leader.
      picks.push({ id: 'SK-08', multiplier: 1.4 });
      picks.push({ id: 'SK-14', multiplier: 1.2 });
      picks.push({ id: 'SK-09', multiplier: 1.1 });
    }
    return picks;
  },
});

// ─── SK-06 Timeline Scanner ──────────────────────────────────────────────────
registerSkill({
  id: 'SK-06',
  block: 'strategist',
  kind: 'selector',
  priority: 80,
  select: (ctx: SkillContext): Pick[] => {
    const picks: Pick[] = [];

    // Phase: bear-off
    if (allCheckersHome(ctx.board, ctx.aiColor)) {
      picks.push({ id: 'SK-16', multiplier: 1.5 });
      picks.push({ id: 'SK-10', multiplier: 1.5 });
      return picks;
    }

    // Phase: opponent on bar → lockdown.
    const opp = ctx.aiColor === 'white' ? 'black' : 'white';
    if (Math.abs(ctx.board[getBarIndex(opp)] ?? 0) > 0) {
      picks.push({ id: 'SK-14', multiplier: 1.4 });
    }

    // Phase: opening — prefer making home-board points (5/20).
    const myHome = getHomeBoard(ctx.aiColor);
    const homePointsMade = countOwned(ctx.board, ctx.aiColor, myHome[0], myHome[1]);
    if (homePointsMade < 3) {
      picks.push({ id: 'SK-08', multiplier: 1.15 });
    }

    return picks;
  },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function pipCount(board: number[], player: PlayerColor): number {
  const s = player === 'white' ? 1 : -1;
  let pip = 0;
  for (let pt = 1; pt <= 24; pt++) {
    const c = board[pt] ?? 0;
    const ours = (s > 0 && c > 0) || (s < 0 && c < 0);
    if (!ours) continue;
    const dist = player === 'white' ? pt : 25 - pt;
    pip += Math.abs(c) * dist;
  }
  pip += Math.abs(board[getBarIndex(player)] ?? 0) * 25;
  return pip;
}

function countOwned(board: number[], player: PlayerColor, lo: number, hi: number): number {
  const s = player === 'white' ? 1 : -1;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    const c = board[i] ?? 0;
    if ((s > 0 && c >= 2) || (s < 0 && c <= -2)) n++;
  }
  return n;
}

// Local alias to avoid importing PlayerColor through two paths.
type PlayerColor = 'white' | 'black';
