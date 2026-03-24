/**
 * Game State Types
 * Pure TypeScript interfaces for Backgammon game logic
 */

export type PlayerColor = 'white' | 'black';

export interface GameState {
  // Board: 0-25 array. 0=bar, 1-24=points, 25=off
  // Positive = White checkers, Negative = Black checkers
  board: number[];
  
  turn: PlayerColor;
  dice: number[];
  usedDice: number[]; // Track which dice have been used
  
  // Doubling Cube
  cube: number;
  cubeOwner: PlayerColor | null;
  
  // Crawford Rule (Match Play)
  crawford: boolean;
  
  // Match Score
  matchScore: {
    white: number;
    black: number;
  };
  
  // Game Result
  winner: PlayerColor | null;

  // History of rolls (for UI/State reconstruction)
  rollHistory?: { player: PlayerColor; dice: number[] }[];
}

export interface Move {
  from: number; // 0-25
  to: number;   // 0-25
  die: number;  // Which die value was used
}

export interface MoveValidation {
  valid: boolean;
  reason?: string; // e.g., "Blocked by opponent", "Must enter from bar first"
}
