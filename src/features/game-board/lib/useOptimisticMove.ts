/**
 * useOptimisticMove Hook - React 19 useOptimistic wrapper
 * Provides instant UI feedback with automatic rollback
 */

import { useOptimistic } from 'react';
import { applyMove } from '../../../entities/game/rules';
import type { UIGameState } from '../model/types';
import type { Move } from '../../../entities/game/types';

/**
 * Custom hook for optimistic UI updates
 * Uses React 19's useOptimistic for instant feedback
 * 
 * @param state - Current game state
 * @param onMove - Callback to trigger actual move validation
 * @returns [optimisticState, makeOptimisticMove]
 */
export function useOptimisticMove(
  state: UIGameState,
  onMove: (move: Move) => void
) {
  const [optimisticState, addOptimisticMove] = useOptimistic(
    state,
    (currentState, newMove: Move) => {
      // Apply move optimistically (no validation!)
      // React will auto-rollback if the actual action fails
      try {
        const newBoard = applyMove(currentState.board, newMove, currentState.turn);
        const newUsedDice = [...currentState.usedDice, newMove.die];
        
        return {
          ...currentState,
          board: newBoard,
          usedDice: newUsedDice,
        };
      } catch {
        // If optimistic update fails, return current state
        return currentState;
      }
    }
  );

  /**
   * Make an optimistic move
   * 1. Updates UI immediately (optimistic)
   * 2. Triggers validation (actual)
   * 3. React auto-rolls back if validation fails
   */
  const makeOptimisticMove = (move: Move) => {
    addOptimisticMove(move); // Instant UI update
    onMove(move);            // Trigger actual validation
  };

  return [optimisticState, makeOptimisticMove] as const;
}
