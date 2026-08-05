/**
 * Game State Store
 * Initial state and utilities for game board
 */

import { INITIAL_BOARD } from '../../../entities/game/constants';
import type { UIGameState } from './types';
import { generateUUID } from '../../../shared/utils/uuid';

/**
 * Initial game state for new game
 */
export const INITIAL_GAME_STATE: UIGameState = {
  game_id: generateUUID(), // Automatically generated on load
  board: [...INITIAL_BOARD],
  turn: 'white',
  dice: [],
  usedDice: [],
  cube: 1,
  cubeOwner: null,
  crawford: false,
  matchScore: {
    white: 0,
    black: 0,
  },
  history: [],
  rollHistory: [],
  isRolling: false,
  winner: null,
  turn_count: 0,
};

/**
 * Create a snapshot of current state for history
 * Excludes history and isRolling to avoid circular references
 */
export function createSnapshot(state: UIGameState): Omit<UIGameState, 'history' | 'isRolling'> {
  return {
    game_id: state.game_id,
    board: [...state.board],
    turn: state.turn,
    dice: [...state.dice],
    usedDice: [...state.usedDice],
    cube: state.cube,
    cubeOwner: state.cubeOwner,
    crawford: state.crawford,
    matchScore: { ...state.matchScore },
    winner: state.winner,
    rollHistory: state.rollHistory ? [...state.rollHistory] : [],
    turn_count: state.turn_count ?? 0,
  };
}
