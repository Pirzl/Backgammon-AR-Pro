/**
 * AI Worker - Background Thread for Backgammon AI
 * Runs Expectimax search without blocking the main UI thread
 * 
 * Message Protocol:
 * - Main → Worker: { type: 'GET_MOVE', state: GameState, requestId: string }
 * - Worker → Main: { type: 'MOVE_READY', move: Move, value: number, requestId: string }
 * - Worker → Main: { type: 'ERROR', error: string, requestId: string }
 */

import { getBestMove } from './expectimax';
import { hashBoard, initializeZobrist } from './zobrist';
import { fetchEvaluation, storeEvaluation, batchStore, saveGameResult } from './api';
import type { Evaluation } from './api';
import { getCached, setCached } from './cache';
import type { GameState, Move, PlayerColor } from '../../entities/game/types';

// Learning State
interface HistoryEntry {
  hash: bigint;
  originalEquity: number;
  move: Move | null;
  turn: PlayerColor;
  timestamp: number;
}

let sessionHistory: HistoryEntry[] = [];

// Initialize Zobrist table on worker startup
initializeZobrist();

/**
 * Message types
 */
interface GetMoveRequest {
  type: 'GET_MOVE';
  state: GameState;
  requestId: string;
}

interface ErrorResponse {
  type: 'ERROR';
  error: string;
  requestId: string;
}

interface GameOverRequest {
  type: 'GAME_OVER';
  winner: PlayerColor;
  loser: PlayerColor;
  method: 'normal' | 'gammon' | 'backgammon';
  score: number;
  finalBoard: number[];
  whitePlayerId?: string | null;
  blackPlayerId?: string | null;
  requestId: string;
}

interface RecordMoveRequest {
  type: 'RECORD_MOVE';
  state: GameState;
  move: Move;
  requestId: string;
}

interface MoveReadyResponse {
  type: 'MOVE_READY';
  move: Move | null;
  value: number;
  requestId: string;
  evalTime: number;
  cacheHit: boolean;
}

type WorkerRequest = GetMoveRequest | GameOverRequest | RecordMoveRequest;

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  
  if (message.type === 'GET_MOVE') {
    await handleGetMove(message);
  } else if (message.type === 'GAME_OVER') {
    await handleGameOver(message);
  } else if (message.type === 'RECORD_MOVE') {
    await handleRecordMove(message);
  }
};

/**
 * Handle Game Over - Trigger Learning
 * Updates visited positions based on actual result
 */
async function handleGameOver(request: GameOverRequest): Promise<void> {
  const { winner, loser, method, score, finalBoard, whitePlayerId, blackPlayerId, requestId } = request;
  const learningRate = 0.1; // Conservative learning rate
  
  try {
    // 1. Save Game Result (Log) with Board Hash
    // We calculate hash here to ensure it uses the worker's Zobrist table (consistent with learning)
    const finalHash = hashBoard(finalBoard);
    
    await saveGameResult(winner, loser, method, score, finalHash, whitePlayerId, blackPlayerId);
    console.log(`[AI Worker] Game result saved. Hash: ${finalHash}`);

    // 2. Learning / Reinforcement
    const updates = new Map<bigint, Omit<Evaluation, 'id' | 'created_at'>>();
    
    // Calculate new equities
    for (const entry of sessionHistory) {
      // SKIP entries with no move (stuck/blocked) to avoid DBNotNullViolation
      if (!entry.move) continue;

      // Reward function: +1 if stored turn matches winner, -1 if loser
      const isWinnerTurn = entry.turn === winner;
      const targetEquity = isWinnerTurn ? 100.0 : -100.0; 
      
      // Calculate delta
      const currentEquity = entry.originalEquity;
      const newEquity = currentEquity + learningRate * (targetEquity - currentEquity);
      
      // Store update
      updates.set(entry.hash, {
        equity: parseFloat(newEquity.toFixed(4)), // Limit precision
        best_move: entry.move, // Guaranteed not null due to check above
        depth: 2 // Keep depth
      });
    }
    
    // Batch update Supabase
      await batchStore(updates);
      console.log(`[AI Learning] Updated ${updates.size} positions based on ${winner} win (Req: ${requestId}).`);

    
    // Clear history for next game
    sessionHistory = [];
    
  } catch (error) {
    console.error('Learning/Save error:', error);
  }
}


/**
 * Record Human Move for Learning
 * Tracks human moves in session history so AI can learn from them at game end
 */
async function handleRecordMove(request: RecordMoveRequest): Promise<void> {
  const { state, move, requestId } = request;
  
  try {
    // Hash the board state before this move
    const hash = hashBoard(state.board);
    
    // We don't need to calculate a full expectimax evaluation here
    // Just track the move for learning at game end
    sessionHistory.push({
      hash,
      originalEquity: 0, // Will be updated at game end based on result
      move,
      turn: state.turn,
      timestamp: Date.now()
    });
    
    console.log(`[AI Learning] Recorded human move for ${state.turn} (Req: ${requestId})`);
    
  } catch (error) {
    console.error('Record move error:', error);
  }
}


/**
 * Process move request
 * OPTIMIZED: Local LRU cache → Supabase → Compute
 */
async function handleGetMove(request: GetMoveRequest): Promise<void> {
  const { state, requestId } = request;
  const startTime = performance.now();
  
  try {
    // 1. Hash current board state
    const hash = hashBoard(state.board);
    
    // 2. Check local LRU cache first (fastest)
    const localCached = getCached(hash);
    if (localCached) {
      const response: MoveReadyResponse = {
        type: 'MOVE_READY',
        move: localCached.best_move,
        value: localCached.equity,
        requestId,
        evalTime: performance.now() - startTime,
        cacheHit: true,
      };
      
      self.postMessage(response);
      return;
    }
    
    // 3. Check Supabase cache (slower but persistent)
    const supabaseCached = await fetchEvaluation(hash);
    
    if (supabaseCached) {
      // Store in local cache for next time
      setCached(hash, supabaseCached);
      
      const response: MoveReadyResponse = {
        type: 'MOVE_READY',
        move: supabaseCached.best_move,
        value: supabaseCached.equity,
        requestId,
        evalTime: performance.now() - startTime,
        cacheHit: true,
      };
      
      self.postMessage(response);
      return;
    }
    
    // 4. Cache miss - compute move with Expectimax (parallelized)
    const { move, value } = await getBestMove(state, 2);
    
    const evaluation = {
      id: hash.toString(),
      equity: value,
      best_move: move,
      depth: 2,
    };
    
    // 5. Store in both caches
    setCached(hash, evaluation);
    
    // Track in session history for learning
    sessionHistory.push({
      hash,
      originalEquity: value,
      move,
      turn: state.turn,
      timestamp: Date.now()
    });

    
    // Only store in DB if we have a valid move (DB constraint requires best_move)
    if (move) {
      await storeEvaluation(hash, {
        equity: value,
        best_move: move,
        depth: 2,
      });
    }
    
    // 6. Return result to main thread
    const response: MoveReadyResponse = {
      type: 'MOVE_READY',
      move,
      value,
      requestId,
      evalTime: performance.now() - startTime,
      cacheHit: false,
    };
    
    self.postMessage(response);
    
  } catch (error) {
    // Handle errors gracefully
    const errorResponse: ErrorResponse = {
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    };
    
    self.postMessage(errorResponse);
  }
}

// Export empty object to satisfy TypeScript module requirements
export {};
