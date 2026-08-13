/**
 * Full-turn move picker shared by self-play and the tournament.
 *
 * Enumerates every legal full-turn sequence for a roll (capped deterministically)
 * and scores all of them with ONE batched evaluator call. Because the cap is a
 * pure function of (board, dice), both sides facing the same position always
 * score the SAME candidate set — a head-to-head stays fair.
 *
 * Convention used everywhere in the pipeline: the evaluator returns a score
 * "for the mover". The NN is side-to-move-aware, so the shared convention for
 * the NN is `score(move) = -V(boardAfter, opponent)` (after a full turn it is
 * the opponent's turn). The heuristic ignores turn, so callers pass
 * `evaluatePosition(boardAfter, mover)`.
 */

import type { Move, PlayerColor } from '../../../entities/game/types';
import { applyMove } from '../../../entities/game/rules';
import { generateAllTurnSequences } from '../../../entities/game/full-turn-generator';

export type MoveSequence = Move[];

export interface BatchSequenceEvaluator {
  (boardAfters: number[][], mover: PlayerColor, opponent: PlayerColor): Promise<number[] | Float32Array>;
}

export interface PickedTurn {
  sequence: MoveSequence;
  score: number;
}

export async function pickBestFullTurn(
  board: number[],
  dice: number[],
  mover: PlayerColor,
  evaluator: BatchSequenceEvaluator,
  options: { maxSequences?: number; epsilon?: number; rng?: () => number } = {},
): Promise<PickedTurn> {
  const maxSequences = options.maxSequences ?? 192;
  const sequences = generateAllTurnSequences(board, dice, mover, [], maxSequences);

  if (sequences.length === 0) return { sequence: [], score: -Infinity };

  const opponent: PlayerColor = mover === 'white' ? 'black' : 'white';

  const afters: number[][] = new Array(sequences.length);
  for (let i = 0; i < sequences.length; i++) {
    let b = board;
    const seq = sequences[i]!;
    for (const m of seq) b = applyMove(b, m, mover);
    afters[i] = b;
  }

  const raw = await evaluator(afters, mover, opponent);

  const scores: number[] = new Array(sequences.length);
  for (let i = 0; i < sequences.length; i++) {
    const s = raw[i] as number;
    scores[i] = Number.isFinite(s) ? s : -Infinity;
  }

  let bestIdx = 0;
  let bestScore = scores[0]!;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > bestScore) {
      bestScore = scores[i]!;
      bestIdx = i;
    }
  }

  const epsilon = options.epsilon ?? 0;
  if (epsilon > 0 && sequences.length > 1) {
    const rng = options.rng ?? Math.random;
    if (rng() < epsilon) {
      const j = Math.floor(rng() * sequences.length);
      return { sequence: sequences[j]!, score: scores[j]! };
    }
  }

  return { sequence: sequences[bestIdx]!, score: bestScore };
}
