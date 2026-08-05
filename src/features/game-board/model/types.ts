/**
 * Game Board Feature - UI State Types
 * Extends core game types with UI-specific state
 */

import type { GameState, Move } from '../../../entities/game/types';
export type { GameState, Move };

/**
 * Game Actions for useActionState reducer
 */
export type GameAction =
  | { type: 'ROLL_DICE'; dice?: number[] }
  | { type: 'SYNC_DICE'; dice: number[] }
  | { type: 'MOVE_CHECKER'; move: Move }
  | { type: 'UNDO_MOVE' }
  | { type: 'NEW_GAME' }
  | { type: 'CONFIRM_TURN_END' }
  | { type: 'OFFER_DOUBLE' }
  | { type: 'TAKE_DOUBLE' }
  | { type: 'DROP_DOUBLE' };

/**
 * UI-specific game state (extends core GameState)
 */
export interface UIGameState extends GameState {
  game_id: string; // Unique identifier for the current game
  history: GameState[];
  isRolling: boolean;
  needsTurnConfirmation?: boolean;
  /** Global turn counter, incremented once per CONFIRM_TURN_END. Used as the
   *  authoritative game-order index when recording `game_history_analysis`
   *  (`turn_number`), replacing the previous per-turn move count. */
  turn_count?: number;
}


