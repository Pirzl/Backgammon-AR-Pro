import type { Move, PlayerColor, GameState } from './types';
import { getValidMoves, applyMove } from './rules';
import { getAvailableDice } from './rules';

const MAX_SEQUENCES = 300;

function boardKey(board: number[]): string {
  return board.join(',');
}

export function generateAllTurnSequences(
  board: number[],
  dice: number[],
  player: PlayerColor,
  usedDice: number[] = []
): Move[][] {
  const results: Move[][] = [];
  const seenFinal = new Set<string>();

  function recurse(
    currentBoard: number[],
    currentMoves: Move[],
    currentUsed: number[]
  ): void {
    if (results.length >= MAX_SEQUENCES) return;

    const available = getAvailableDice(dice, currentUsed);
    if (available.length === 0) {
      const key = boardKey(currentBoard);
      if (!seenFinal.has(key)) {
        seenFinal.add(key);
        results.push([...currentMoves]);
      }
      return;
    }

    const state: GameState = {
      board: currentBoard,
      turn: player,
      dice,
      usedDice: currentUsed,
      cube: 1,
      cubeOwner: null,
      crawford: false,
      matchScore: { white: 0, black: 0 },
      winner: null,
    };

    const legalMoves = getValidMoves(state);
    if (legalMoves.length === 0) {
      const key = boardKey(currentBoard);
      if (!seenFinal.has(key)) {
        seenFinal.add(key);
        results.push([...currentMoves]);
      }
      return;
    }

    let moved = false;

    const seenAfterMove = new Set<string>();

    for (const move of legalMoves) {
      if (results.length >= MAX_SEQUENCES) return;

      const newBoard = applyMove(currentBoard, move, player);
      const afterKey = boardKey(newBoard);

      if (seenAfterMove.has(afterKey)) continue;
      seenAfterMove.add(afterKey);

      currentMoves.push(move);
      currentUsed.push(move.die);
      moved = true;

      recurse(newBoard, currentMoves, currentUsed);

      currentMoves.pop();
      currentUsed.pop();
    }

    if (!moved) {
      const key = boardKey(currentBoard);
      if (!seenFinal.has(key)) {
        seenFinal.add(key);
        results.push([...currentMoves]);
      }
    }
  }

  recurse(board, [], usedDice);

  return results;
}
