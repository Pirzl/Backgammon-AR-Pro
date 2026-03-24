/**
 * useGameState Hook - React 19 useActionState wrapper
 * Manages game state with concurrent features
 */

import { useActionState } from 'react';
import { gameReducer } from '../model/actions';
import { INITIAL_GAME_STATE } from '../model/store';
import type { UIGameState, GameAction } from '../model/types';

/**
 * Custom hook for game state management
 * Uses React 19's useActionState for concurrent state updates
 * 
 * @returns [state, dispatch, isPending]
 */
export function useGameState() {
  const [state, dispatch, isPending] = useActionState<UIGameState, GameAction>(
    gameReducer,
    INITIAL_GAME_STATE
  );

  return {
    state,
    dispatch,
    isPending,
  };
}
