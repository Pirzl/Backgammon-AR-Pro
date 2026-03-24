/**
 * Supabase Database Types
 * Auto-generated type definitions for database schema
 * CRITICAL: Zobrist hashes are transported as 'string' for BigInt safety
 */

export interface ZobristEvaluation {
  id: string; // CRITICAL: Transported as string, stored as bigint
  equity: number;
  best_move: {
    from: number;
    to: number;
  };
  depth: number;
  created_at?: string;
}

export interface Match {
  id: string;
  room_id?: string;
  player_white?: string;
  player_black?: string;
  current_turn?: string;
  board_state?: unknown; // jsonb - legacy field, prefer 'state'
  state?: GameState; // jsonb - current game state
  cube_value: number;
  cube_owner: 'white' | 'black' | null;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  winner_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GameState {
  board: number[]; // 0-25 (Signed: +White, -Black)
  turn: 'white' | 'black';
  dice: number[];
  cube: number;
  cubeOwner: 'white' | 'black' | null;
}
