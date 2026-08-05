/**
 * Analyze a match replay: for every AI (black) turn, compare the played sequence
 * against the best-ranked sequence by the expectimax heuristic (the pre-NN
 * master behaviour) and by NN+heuristic blend (current L10 behaviour).
 *
 * Usage: tsx scripts/ai-training/analyze-replay.ts <path-to-replay.json>
 */

import * as fs from 'node:fs';
import { applyMove, getValidMoves } from '../../src/entities/game/rules';
import { INITIAL_BOARD } from '../../src/entities/game/constants';
import { generateAllTurnSequences } from '../../src/entities/game/full-turn-generator';
import { evaluatePosition as heuristicEvaluate } from '../../src/features/ai-worker/expectimax';
import type { Move, PlayerColor } from '../../src/entities/game/types';
import { aiModel } from '../../src/features/ai-worker/nn-model';

interface ReplayMove { from: number; to: number; die: number }
interface ReplayTurn { player: PlayerColor; dice: number[]; moves: ReplayMove[] }
interface MatchReplay { game_id: string; winner: PlayerColor | null; turns: ReplayTurn[] }

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/ai-training/analyze-replay.ts <replay.json>');
  process.exit(1);
}
const replay = JSON.parse(fs.readFileSync(file, 'utf-8')) as MatchReplay;

// L10 master weights from getDifficultyWeights(10)
const NN_W = 0.40;
const HEUR_W = 0.60;
const STRATEGY = 2.0;

let board = [...INITIAL_BOARD];
const AI = 'black';
let aiBadMoves = 0;
let aiGoodMoves = 0;

function applySeq(b: number[], seq: ReplayMove[], player: PlayerColor): number[] {
  let nb = [...b];
  for (const m of seq) nb = applyMove(nb, m, player);
  return nb;
}

function seqKey(seq: ReplayMove[]): string {
  return seq.map(m => `${m.from}->${m.to}`).join(',');
}

// Load trained weights if available
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

  for (const turn of replay.turns) {
    if (turn.player === AI && turn.moves.length > 0) {
      const dice = [...turn.dice];
      const player: PlayerColor = turn.player;
      const playedKey = seqKey(turn.moves);

      const state = {
        board, turn: player, dice, usedDice: [],
        cube: 1, cubeOwner: null, crawford: false,
        matchScore: { white: 0, black: 0 }, winner: null,
      };
      const legalMoves = getValidMoves(state);

      let sequences: Move[][] = [];
      if (legalMoves.length > 0) {
        sequences = generateAllTurnSequences(board, dice, player);
      }

      // Score each sequence with heuristic and NN+heuristic blend
      const scored: { seq: Move[]; key: string; heur: number; blend: number; nn: number }[] = [];
      for (const seq of sequences) {
        const finalBoard = applySeq(board, seq as ReplayMove[], player);
        const heur = heuristicEvaluate(finalBoard, player, STRATEGY);
        let blend = heur;
        let nn = 0;
        if (aiModel.isLoaded()) {
          try {
            nn = await aiModel.evaluate(finalBoard, player);
            blend = (nn * 50 * NN_W) + (heur * HEUR_W);
          } catch { /* keep heuristic-only */ }
        }
        scored.push({ seq, key: seqKey(seq as ReplayMove[]), heur, blend, nn });
      }

      if (scored.length === 0) {
        // No legal sequence (blocked) - fine if played nothing
        board = applySeq(board, turn.moves, turn.player);
        continue;
      }

      scored.sort((a, b) => b.blend - a.blend);
      const bestHeur = [...scored].sort((a, b) => b.heur - a.heur)[0];
      const bestBlend = scored[0];
      const played = scored.find(s => s.key === playedKey);

      const heurRank = scored.filter(s => s.heur > (played?.heur ?? -Infinity)).length + 1;
      const playedIsBestHeur = played?.key === bestHeur.key;
      const playedIsBestBlend = played?.key === bestBlend.key;

      if (!playedIsBestBlend) aiBadMoves++;
      else aiGoodMoves++;

      console.log('─'.repeat(80));
      console.log(`Turn #${replay.turns.indexOf(turn) + 1} ${turn.player} dice=[${dice}]`);
      console.log(`  played: ${playedKey || '(blocked)'}  heur=${played?.heur?.toFixed(2) ?? '—'}  blend=${played?.blend?.toFixed(2) ?? '—'}`);
      console.log(`  bestHeur: ${bestHeur.key} heur=${bestHeur.heur.toFixed(2)}  ${playedIsBestHeur ? '(= played)' : ''}`);
      console.log(`  bestBlend: ${bestBlend.key} blend=${bestBlend.blend.toFixed(2)} nn=${bestBlend.nn.toFixed(3)}  ${playedIsBestBlend ? '(= played)' : ''}`);
      console.log(`  heuristic rank of played: ${heurRank}/${scored.length}`);

      // Show top-3 alternatives when the played move is clearly suboptimal
      const gap = played ? bestBlend.blend - played.blend : 0;
      if (gap > 1.5) {
        console.log(`  ⚠️ suboptimal: best beats played by ${gap.toFixed(2)}`);
        for (const s of scored.slice(0, 3)) {
          const marker = s.key === playedKey ? ' (PLAYED)' : '';
          console.log(`     ${s.key}  blend=${s.blend.toFixed(2)} heur=${s.heur.toFixed(2)} nn=${s.nn.toFixed(3)}${marker}`);
        }
      }
    }

    // Apply the played moves to advance the real board
    board = applySeq(board, turn.moves, turn.player);
  }

  console.log('═'.repeat(80));
  console.log(`AI (${AI}) decisions: ${aiGoodMoves} optimal (matches best blend), ${aiBadMoves} suboptimal`);
}

main().catch(err => {
  console.error('ANALYZE_ERROR=' + String(err));
  process.exit(1);
});
