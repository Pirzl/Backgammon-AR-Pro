/**
 * Dense training labels (C)
 *
 * Instead of the binary ±1 win/loss target, label every recorded position with
 * a continuous score from the expectimax search, normalized to [-1, 1]:
 *
 *   target = clamp(expectimaxValue / 50, -1, 1)
 *
 * The expectimax leaf heuristic (evaluatePosition) already returns values in
 * [-50, 50] (and ±100 only at terminal states, which clamp to ±1 here), so the
 * network learns a smooth value function instead of only game outcomes.
 */

import type { GameState, PlayerColor } from '../../../entities/game/types';
import { evaluatePosition, expectimaxChance } from '../expectimax';

function normalize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value / 50));
}

/**
 * Compute a dense target in [-1, 1] for a board position from `turn`'s
 * perspective.
 *
 * @param depth  0 (default) uses the static leaf heuristic (fast, cheap).
 *               >0 runs a full expectimax chance-node search at that depth
 *               (slower but richer, async).
 */
export async function denseTarget(
  board: number[],
  turn: PlayerColor,
  depth = 0,
): Promise<number> {
  if (depth <= 0) {
    return normalize(evaluatePosition(board, turn));
  }

  const state: GameState = {
    board,
    turn,
    dice: [],
    usedDice: [],
    cube: 1,
    cubeOwner: null,
    crawford: false,
    matchScore: { white: 0, black: 0 },
    winner: null,
  };

  try {
    return normalize(await expectimaxChance(state, depth, turn));
  } catch {
    // Fall back to the static heuristic if the search fails for this position.
    return normalize(evaluatePosition(board, turn));
  }
}
