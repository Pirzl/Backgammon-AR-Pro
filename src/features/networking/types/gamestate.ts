// Type Definitions for Realtime Game State Sync

export interface PresenceState {
  userId: string;
  onlineAt: number;
}

export type MoveType = 'game-move' | 'signal' | 'cursor-update' | 'chat-message';

// WebRTC Signaling Data
export type SignalPayload = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export interface GameMovePayload {
  fromIndex: number;
  toIndex: number;
  diceUsed: number[];
}

export interface CursorPayload {
  x: number;
  y: number;
  gesture: 'open' | 'pinch' | 'point';
}

// Union type for all possible move data
export type MoveData = 
  | { type: 'signal'; target?: string; payload: SignalPayload }
  | { type: 'game-move'; payload: GameMovePayload }
  | { type: 'cursor-update'; payload: CursorPayload }
  | { type: 'chat-message'; payload: string };

// The top-level payload received from Supabase Broadcast
export interface GamePayload {
  from: string;
  move: MoveData;
  timestamp?: number;
}
