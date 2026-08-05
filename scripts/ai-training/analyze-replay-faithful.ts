/**
 * Faithful replay analyzer for the L10 master.
 *
 * Reconstructs a real game board turn-by-turn and, for every AI (black) turn,
 * reproduces the EXACT decision function used by getGrandmasterMove at L10:
 *
 *   - opening book (L9-10 expert table) handled via a call to getGrandmasterMove
 *     itself (the real master), so opening/book logic is never re-implemented;
 *   - presort all full-turn sequences by static heuristic, keep top 500;
 *   - score each: (nn*50*0.40) + (heur*0.60), then blend with expectimaxChance
 *     depth 2 (oppWeight 0.4);
 *   - compare the master's pick to the move actually played;
 *   - compute a deeper oracle (expectimaxChance depth 3) over the top candidate
 *     sequences to flag genuine blunders the shallow master cannot see.
 *
 * Usage: tsx scripts/ai-training/analyze-replay-faithful.ts <replay.json>
 */

import * as fs from 'node:fs';
import { applyMove, getValidMoves } from '../../src/entities/game/rules';
import { INITIAL_BOARD } from '../../src/entities/game/constants';
import { generateAllTurnSequences } from '../../src/entities/game/full-turn-generator';
import { evaluatePosition as heuristicEvaluate, expectimaxChance } from '../../src/features/ai-worker/expectimax';
import type { Move, PlayerColor, GameState } from '../../src/entities/game/types';
import { aiModel } from '../../src/features/ai-worker/nn-model';
import { getExpertOpeningSequence } from '../../src/features/game-board/opening-book';

// L10 config from getDifficultyWeights + getAIConfig
const NN_W = 0.40;
const HEUR_W = 0.60;
const STRATEGY = 2.0;
const OPP_WEIGHT = 0.4;
const EXPECTIMAX_DEPTH = 2;
const MAX_SEQUENCES = 500;

interface ReplayMove { from: number; to: number; die: number }
interface ReplayTurn { player: PlayerColor; dice: number[]; moves: ReplayMove[] }
interface MatchReplay { game_id: string; winner: PlayerColor | null; turns: ReplayTurn[] }

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/ai-training/analyze-replay-faithful.ts <replay.json>');
  process.exit(1);
}
const replay = JSON.parse(fs.readFileSync(file, 'utf-8')) as MatchReplay;

const AI = 'black';

function seqKey(seq: ReplayMove[]): string {
  return seq.map(m => `${m.from}->${m.to}`).join(',');
}

function applySeq(b: number[], seq: ReplayMove[], player: PlayerColor): number[] {
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

async function loadNN(): Promise<void> {
  try {
    const p = new URL('../model_weights.json', import.meta.url);
    const cp = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (cp.weights?.length) {
      await aiModel.ensureModel();
      if (aiModel.deserializeWeights(cp.weights)) {
        console.log(`[NN] Loaded checkpoint (${cp.trained_count ?? '?'} positions)`);
      }
    }
  } catch {
    console.log('[NN] No checkpoint found; heuristic-only analysis');
  }
}

async function main(): Promise<void> {
  await loadNN();

  let board = [...INITIAL_BOARD];
  let masterBlunders = 0;
  let matches = 0;
  let decisions = 0;

  // Played-vs-master / played-vs-oracle ledger (REFORM 2026-08-03): quantifies
  // how far the runtime pick is from the base-blend master and the deep-3 oracle,
  // so the skill-layer impact is measurable after the reflective override was
  // disabled.
  let playedGapTurns = 0;
  let playedGapTotal = 0;
  let playedOracleGapTotal = 0;
  let playedBlunders = 0;
  let playedNotInTop500 = 0;

  for (const turn of replay.turns) {
    if (turn.player === AI && turn.moves.length > 0) {
      const dice = [...turn.dice];
      const player: PlayerColor = turn.player;
      const playedKey = seqKey(turn.moves);
      decisions++;

      // L9-10 expert opening table (pure module, shared with the live master).
      // Only fires while our checkers are still in the opening arrangement, so
      // it matches exactly what getGrandmasterMove does at difficulty 9-10.
      const expert = getExpertOpeningSequence(dice, board, player);
      if (expert) {
        const expertKey = seqKey(expert as ReplayMove[]);
        const isMatch = expertKey === playedKey;
        if (isMatch) matches++; else masterBlunders++;
        console.log('─'.repeat(88));
        console.log(`Turn #${replay.turns.indexOf(turn) + 1} ${turn.player} dice=[${dice}]`);
        console.log(`  played : ${playedKey}`);
        console.log(`  expert : ${expertKey}${isMatch ? '  (= played)' : ''} (L9-10 opening book)`);
        board = applySeq(board, turn.moves, turn.player);
        continue;
      }

      const state = makeState(board, dice, player);
      const legalMoves = getValidMoves(state);
      let sequences: Move[][] = [];
      if (legalMoves.length > 0) {
        sequences = generateAllTurnSequences(board, dice, player);
      }

      if (sequences.length === 0) {
        board = applySeq(board, turn.moves, turn.player);
        continue;
      }

      // Presort by static heuristic and keep the same top-N the master evaluates.
      const presorted = sequences
        .map(seq => {
          const fb = applySeq(board, seq as ReplayMove[], player);
          return { seq, quick: heuristicEvaluate(fb, player, STRATEGY) };
        })
        .sort((a, b) => b.quick - a.quick);
      const candidates = presorted.slice(0, MAX_SEQUENCES);

      // Score each candidate with the exact master formula.
      const scored: { seq: Move[]; key: string; heur: number; nn: number; exp: number | null; score: number; deep?: number | null }[] = [];
      for (const c of candidates) {
        const finalBoard = applySeq(board, c.seq as ReplayMove[], player);
        let nn = 0;
        if (aiModel.isLoaded()) {
          try { nn = await aiModel.evaluate(finalBoard, player); } catch { /* keep 0 */ }
        }
        const heur = heuristicEvaluate(finalBoard, player, STRATEGY);
        let base = (nn * 50 * NN_W) + (heur * HEUR_W);

        const oppState = makeState(finalBoard, [], player === 'white' ? 'black' : 'white');
        let exp: number | null = null;
        try {
          exp = await expectimaxChance(oppState, EXPECTIMAX_DEPTH, player);
        } catch { /* keep null */ }
        if (exp !== null) {
          base = (base * (1 - OPP_WEIGHT)) + (exp * OPP_WEIGHT);
        }
        scored.push({ seq: c.seq, key: seqKey(c.seq as ReplayMove[]), heur, nn, exp, score: base });
      }

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0]!;
      const played = scored.find(s => s.key === playedKey);

      // Deeper oracle over the top-5 candidates: depth 3 lookahead.
      const oracleBest = scored[0]!;
      for (const s of scored.slice(0, 5)) {
        const finalBoard = applySeq(board, s.seq as ReplayMove[], player);
        const oppState = makeState(finalBoard, [], player === 'white' ? 'black' : 'white');
        let deep: number | null = null;
        try { deep = await expectimaxChance(oppState, 3, player); } catch { /* keep null */ }
        s.deep = deep;
      }
      const deepRanked = scored.slice(0, 5).sort((a, b) => (b.deep ?? -Infinity) - (a.deep ?? -Infinity));
      const oracle = deepRanked[0]!;

      const matchesBest = played?.key === best.key;
      const matchesOracle = played?.key === oracle.key;
      const masterMatchesOracle = best.key === oracle.key;
      const mGap = (oracle.deep ?? 0) - (best.deep ?? 0);
      const isBlunder = !masterMatchesOracle && mGap > 2.0;
      if (isBlunder) masterBlunders++; else matches++;

      // Played ledger: score the actual runtime pick against the base blend and
      // the deep-3 oracle. A played blunder = played deviates >2.0 from the
      // oracle (only when played landed inside the top-5 oracle sample).
      if (played) {
        const playedGap = played.score - best.score;
        playedGapTurns++;
        playedGapTotal += playedGap;
        const playedOracleGap = (oracle.deep ?? 0) - (played.deep ?? 0);
        playedOracleGapTotal += playedOracleGap;
        const pBlunder = !matchesOracle && played.deep != null && playedOracleGap > 2.0;
        if (pBlunder) playedBlunders++;
      } else {
        playedNotInTop500++;
      }

      console.log('─'.repeat(88));
      console.log(`Turn #${replay.turns.indexOf(turn) + 1} ${turn.player} dice=[${dice}]`);
      console.log(`  played : ${playedKey || '(none)'}  score=${played?.score?.toFixed(2) ?? '—'}  heur=${played?.heur?.toFixed(1) ?? '—'}  exp2=${played?.exp?.toFixed(1) ?? '—'}  deep3=${played?.deep?.toFixed(1) ?? '—'}`);
      console.log(`  master : ${best.key} score=${best.score.toFixed(2)}${matchesBest ? '  (= played)' : ''}`);
      console.log(`  oracle : ${oracle.key} deep3=${(oracle.deep ?? 0).toFixed(1)}${matchesOracle ? '  (= played)' : ''}`);

      if (played) {
        const playedGap = played.score - best.score;
        const playedOracleGap = (oracle.deep ?? 0) - (played.deep ?? 0);
        console.log(`  played vs master: gap ${playedGap.toFixed(2)}${matchesBest ? ' (= master)' : ''}`);
        const pBlunder = !matchesOracle && played.deep != null && playedOracleGap > 2.0;
        if (pBlunder) {
          console.log(`  ⚠️ PLAYED BLUNDER vs deep oracle (gap ${playedOracleGap.toFixed(1)})`);
        } else if (!matchesOracle) {
          console.log(`  (played deviates from oracle, gap ${playedOracleGap.toFixed(1)})`);
        }
      } else {
        console.log(`  ⚠️ PLAYED NOT IN TOP-${MAX_SEQUENCES} (quick-sort) — not scored`);
      }

      const mGapLabel = mGap.toFixed(1);
      if (isBlunder) {
        console.log(`  ⚠️ MASTER BLUNDER vs deep oracle (gap ${mGapLabel})`);
        for (const s of scored.slice(0, 4)) {
          const marker = s.key === best.key ? ' (MASTER)' : '';
          console.log(`     ${s.key}  score=${s.score.toFixed(2)} heur=${s.heur.toFixed(1)} deep3=${s.deep?.toFixed(1) ?? '—'}${marker}`);
        }
      } else if (!masterMatchesOracle) {
        console.log(`  (master deviates from deep oracle, gap ${mGapLabel} → minor)`);
      } else {
        console.log(`  master = deep oracle ✓`);
      }
    }

    board = applySeq(board, turn.moves, turn.player);
  }

  console.log('═'.repeat(88));
  console.log(`AI (${AI}): master matches deep oracle in ${matches}/${decisions} turns, ${masterBlunders} master blunders vs deep oracle.`);
  if (playedGapTurns > 0) {
    const avg = playedGapTotal / playedGapTurns;
    const avgOracle = playedOracleGapTotal / playedGapTurns;
    console.log(`Played ledger (vs base-blend master): avg gap ${avg.toFixed(2)} (sum ${playedGapTotal.toFixed(1)}) over ${playedGapTurns} turns; ${playedBlunders} played blunders vs oracle (avg oracle gap ${avgOracle.toFixed(2)}); ${playedNotInTop500} played moves outside top-${MAX_SEQUENCES}.`);
  } else {
    console.log('Played ledger: no scored played turns.');
  }
}

main().catch(err => {
  console.error('ANALYZE_ERROR=' + String(err));
  process.exit(1);
});
