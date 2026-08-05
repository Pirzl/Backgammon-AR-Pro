/**
 * Audit script: reproduce the L10 decision at black T8 of replay dd813cdb to
 * determine WHY the live AI played 12->18,17->21 while the analyzer's replica
 * (NN+heur+expectimax, no skills) preferred 1->7,12->16.
 *
 * Tests three modes against the EXACT reflective-selection logic in
 * ai-service.ts getGrandmasterMove:
 *   A. NN on  + skills delta   (assumed live path)
 *   B. NN off + skills delta   (browser failed to load weights)
 *   C. NN on  + no skills      (analyzer replica)
 *
 * Uses the real tactical/selector skills (pure modules, no Supabase).
 *
 * Usage: tsx scripts/ai-training/audit-t8.ts <replay.json>
 */
import * as fs from 'node:fs';
import { applyMove, getValidMoves } from '../../src/entities/game/rules';
import { INITIAL_BOARD } from '../../src/entities/game/constants';
import { generateAllTurnSequences } from '../../src/entities/game/full-turn-generator';
import { evaluatePosition as heuristicEvaluate, expectimaxChance } from '../../src/features/ai-worker/expectimax';
import { aiModel } from '../../src/features/ai-worker/nn-model';
import type { Move, PlayerColor, GameState } from '../../src/entities/game/types';

// Real skills modules (pure — no supabase import chain).
import '../../src/features/ai-worker/skills/tactical';
import '../../src/features/ai-worker/skills/selectors';
import { planForContext } from '../../src/features/ai-worker/skills/registry';
import { BASE_WEIGHTS } from '../../src/features/ai-worker/skills/types';
import type { SkillContext, TacticalSkill } from '../../src/features/ai-worker/skills/types';

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/ai-training/audit-t8.ts <replay.json>');
  process.exit(1);
}
const replay = JSON.parse(fs.readFileSync(file, 'utf-8'));

const AI: PlayerColor = 'black';
const NN_W = 0.4;
const HEUR_W = 0.6;
const STRATEGY = 2.0;
const OPP_WEIGHT = 0.4;
const EXP_DEPTH = 2;
const MAX_SEQUENCES = 500;

function seqKey(seq: Move[]): string {
  return seq.map((m) => `${m.from}->${m.to}`).join(',');
}

function applySeq(b: number[], seq: Move[], player: PlayerColor): number[] {
  let nb = [...b];
  for (const m of seq) nb = applyMove(nb, m, player);
  return nb;
}

function makeState(board: number[], dice: number[], turn: PlayerColor): GameState {
  return {
    board,
    turn,
    dice,
    usedDice: [],
    cube: 1,
    cubeOwner: null,
    crawford: false,
    matchScore: { white: 0, black: 0 },
    winner: null,
  };
}

// safeSlotDelta — replicated from ai-service.ts (pure, cannot import ai-service in Node).
function safeSlotDelta(seq: Move[], boardAfter: number[], aiColor: PlayerColor): number {
  const sign = aiColor === 'white' ? 1 : -1;
  const dir = aiColor === 'white' ? -1 : 1;
  let delta = 0;
  for (const move of seq) {
    const dest = move.to;
    if (dest < 1 || dest > 24) continue;
    const v = boardAfter[dest] ?? 0;
    const isLone = (sign > 0 && v === 1) || (sign < 0 && v === -1);
    if (!isLone) continue;
    let threat = 0;
    for (let pip = 1; pip <= 6; pip++) {
      const idx = dest + dir * pip;
      if (idx < 1 || idx > 24) continue;
      const t = boardAfter[idx] ?? 0;
      if ((sign > 0 && t < 0) || (sign < 0 && t > 0)) threat += 0.35 + (6 - pip) * 0.12;
    }
    if (threat === 0) delta += 0.25;
  }
  return delta;
}

// scoreForSequenceBySkills — replicated from ai-service.ts:420-450.
function skillDelta(seq: Move[], boardAfter: number[], ctx: SkillContext): number {
  const sign = ctx.aiColor === 'white' ? 1 : -1;
  const own = (v: number) => (sign > 0 && v > 0) || (sign < 0 && v < 0);
  let delta = 0;

  const plan = planForContext(ctx);

  let simBoard = [...ctx.board];
  for (const move of seq) {
    const moveCtx: SkillContext = { ...ctx, board: simBoard };
    for (const step of plan) {
      const skill = step.skill;
      if (skill.applies(move, moveCtx)) {
        delta += skill.score(move, moveCtx) * step.multiplier;
      }
    }
    simBoard = applyMove(simBoard, move, ctx.aiColor);
  }

  const backOrigin = ctx.aiColor === 'white' ? 24 : 1;
  if (seq.some((m) => m.from === backOrigin)) delta += 0.4;

  const unstackFrom = ctx.aiColor === 'white' ? [13, 6] : [12, 19];
  if (seq.some((m) => unstackFrom.includes(m.from))) delta += 0.3;
  for (let i = 1; i <= 24; i++) {
    const v = boardAfter[i] ?? 0;
    if (own(v) && Math.abs(v) > 3) delta -= 0.2 * (Math.abs(v) - 3);
  }

  delta += safeSlotDelta(seq, boardAfter, ctx.aiColor);
  return delta;
}

async function loadNN(): Promise<boolean> {
  try {
    const p = new URL('../model_weights.json', import.meta.url);
    const cp = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (cp.weights?.length) {
      await aiModel.ensureModel();
      if (aiModel.deserializeWeights(cp.weights)) {
        console.log(`[NN] Loaded checkpoint (${cp.trained_count ?? '?'})`);
        return true;
      }
    }
  } catch {
    console.log('[NN] no checkpoint; heuristic-only');
  }
  return false;
}

async function main(): Promise<void> {
  const nnLoaded = await loadNN();

  // Reconstruct board before black T8.
  let board = [...INITIAL_BOARD];
  const turns = replay.turns as Array<{ player: PlayerColor; dice: number[]; moves: Move[] }>;
  let t8: { dice: number[]; moves: Move[] } | null = null;
  let idx = 0;
  for (; idx < turns.length; idx++) {
    const turn = turns[idx]!;
    if (turn.player === AI && turn.dice.length === 2 && Math.max(...turn.dice) === 6 && Math.min(...turn.dice) === 4 && turn.moves.length === 2) {
      t8 = turn;
      break;
    }
    board = applySeq(board, turn.moves, turn.player);
  }
  if (!t8) {
    console.error('T8 (black 6-4) not found');
    process.exit(1);
  }
  const dice = [...t8.dice];
  const playedKey = seqKey(t8.moves);
  console.log(`Board before T8 (after turn #${idx}); dice=[${dice}] played=${playedKey}`);

  const state = makeState(board, dice, AI);
  const legalMoves = getValidMoves(state);
  let sequences: Move[][] = [];
  if (legalMoves.length > 0) sequences = generateAllTurnSequences(board, dice, AI);

  // Presort (same as master).
  const presorted = sequences
    .map((seq) => {
      const fb = applySeq(board, seq, AI);
      return { seq, quick: heuristicEvaluate(fb, AI, STRATEGY) };
    })
    .sort((a, b) => b.quick - a.quick);
  const candidates = presorted.slice(0, MAX_SEQUENCES).map((c) => c.seq);

  // Skill context (weights = BASE_WEIGHTS, no rival/history — Node approximation).
  const baseCtx: SkillContext = {
    state,
    aiColor: AI,
    board,
    dice,
    rivalId: null,
    profile: null,
    weights: { ...BASE_WEIGHTS },
    history: null,
    innovate: false,
  };

  type Row = {
    seq: Move[];
    key: string;
    heur: number;
    nn: number;
    exp: number;
    base: number;
    delta: number;
  };

  const rows: Row[] = [];
  for (const seq of candidates) {
    const finalBoard = applySeq(board, seq, AI);
    const heur = heuristicEvaluate(finalBoard, AI, STRATEGY);
    let nn = 0;
    if (nnLoaded) {
      try {
        nn = await aiModel.evaluate(finalBoard, AI);
      } catch {
        /* 0 */
      }
    }
    const base0 = nn * 50 * NN_W + heur * HEUR_W;
    const oppState = makeState(finalBoard, [], AI === 'white' ? 'black' : 'white');
    let exp = 0;
    try {
      exp = (await expectimaxChance(oppState, EXP_DEPTH, AI)) ?? 0;
    } catch {
      /* 0 */
    }
    const base = base0 * (1 - OPP_WEIGHT) + exp * OPP_WEIGHT;
    const delta = skillDelta(seq, finalBoard, baseCtx);
    rows.push({ seq, key: seqKey(seq), heur, nn, exp, base, delta });
  }

  // Selection loop replicating getGrandmasterMove. `fixed` toggles the
  // 2026-08-03 baseReflectiveScore fix (bestBaseScore tracked separately).
  function runMode(useNN: boolean, useSkills: boolean, fixed: boolean): { pick: Row; played: Row | null; top: Row[] } {
    let bestSeq = candidates[0]!;
    let bestScore = -Infinity;
    let bestBaseScore = -Infinity;
    for (const r of rows) {
      let score = useNN ? r.base : r.heur; // heuristic-only: pure heuristic (no exp blend)
      let reflectiveScore = score;
      let chosenBy: 'base' | 'reflect' = 'base';
      if (useSkills) {
        reflectiveScore = score + r.delta;
        const basePickDelta = (() => {
          const b = rows.find((x) => x.key === seqKey(bestSeq));
          return b ? b.delta : 0;
        })();
        const refBase = fixed ? bestBaseScore : bestScore;
        const baseReflectiveScore = refBase + basePickDelta;
        if (reflectiveScore > baseReflectiveScore + 0.05) chosenBy = 'reflect';
      }
      const eff = chosenBy === 'reflect' ? reflectiveScore : score;
      if (eff > bestScore) {
        bestScore = eff;
        bestBaseScore = score;
        bestSeq = r.seq;
      }
    }
    const pick = rows.find((r) => r.key === seqKey(bestSeq))!;
    const played = rows.find((r) => r.key === playedKey) ?? null;
    const top = [...rows].sort((a, b) => (useNN ? b.base : b.heur) - (useNN ? a.base : a.heur)).slice(0, 10);
    return { pick, played, top };
  }

  const modeA = runMode(true, true, false);  // old (buggy) reflective logic
  const modeD = runMode(true, true, true);   // FIXED reflective logic
  const modeB = runMode(false, true, true);  // NN off + skills (fixed)
  const modeC = runMode(true, false, true);  // NN on, no skills (analyzer replica)

  const fmt = (r: Row | null) =>
    r ? `${r.key}  base=${r.base.toFixed(2)} heur=${r.heur.toFixed(1)} delta=${r.delta.toFixed(2)}` : '(not in top-500)';

  console.log('\n── Top-10 by base score (NN on) ──');
  for (const [i, r] of modeA.top.entries()) {
    console.log(`  #${i + 1} ${fmt(r)}${r.key === playedKey ? '   ◄ PLAYED' : ''}`);
  }

  console.log('\n══ Result per mode ══');
  console.log(`A) NN on + skills (old buggy): pick=${modeA.pick.key}   played=${fmt(modeA.played)}`);
  console.log(`D) NN on + skills (FIXED)    : pick=${modeD.pick.key}   played=${fmt(modeD.played)}`);
  console.log(`B) NN off+ skills (fixed)    : pick=${modeB.pick.key}   played=${fmt(modeB.played)}`);
  console.log(`C) NN on, no skills          : pick=${modeC.pick.key}   played=${fmt(modeC.played)}`);

  const rankOf = (rows: Row[], key: string) => {
    const sorted = [...rows].sort((a, b) => b.base - a.base);
    const i = sorted.findIndex((r) => r.key === key);
    return i === -1 ? 'n/a' : `#${i + 1}/${sorted.length}`;
  };
  console.log(`\nPlayed move rank by base score: ${rankOf(rows, playedKey)}`);
  console.log(`Played move delta vs #1 base pick: ${(rows.find((r) => r.key === playedKey)?.delta ?? 0).toFixed(2)}`);
}

main().catch((err) => {
  console.error('AUDIT_ERROR=' + String(err));
  process.exit(1);
});
