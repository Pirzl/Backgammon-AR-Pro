/**
 * Zobrist Hashing for Backgammon
 * 64-bit board state fingerprinting using XOR logic
 * 
 * CRITICAL: All hash values are BigInt (64-bit) to ensure uniqueness
 * across the vast Backgammon state space (~10^20 positions)
 */

import type { Move } from '../../entities/game/types';

// Zobrist table: [point][checkerValue] -> BigInt hash
// Point range: 0-25 (BAR=0, 1-24=points, OFF=25)
// Checker values: -15 to +15 (negative=black, positive=white)
type ZobristTable = Map<number, Map<number, bigint>>;

let zobristTable: ZobristTable | null = null;

/**
 * Generate cryptographically random 64-bit BigInt
 * Uses Web Crypto API for high-quality randomness
 */
function randomBigInt64(): bigint {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  
  // Convert 8 bytes to BigInt
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(buffer[i]!);
  }
  
  return result;
}

/**
 * Initialize Zobrist table with random values
 * Must be called once before hashing operations
 * 
 * Table structure:
 * - 26 points (BAR, 1-24, OFF)
 * - 31 possible values per point (-15 to +15 checkers)
 * - Total: 26 × 31 = 806 random BigInt values
 */
export function initializeZobrist(): void {
  if (zobristTable !== null) {
    return; // Already initialized
  }
  
  zobristTable = new Map();
  
  for (let point = 0; point <= 25; point++) {
    const pointMap = new Map<number, bigint>();
    
    // Generate random hash for each possible checker count
    for (let checkers = -15; checkers <= 15; checkers++) {
      if (checkers === 0) continue; // No hash needed for empty points
      
      pointMap.set(checkers, randomBigInt64());
    }
    
    zobristTable.set(point, pointMap);
  }
}

/**
 * Get Zobrist table (initialize if needed)
 */
function getZobristTable(): ZobristTable {
  if (zobristTable === null) {
    initializeZobrist();
  }
  return zobristTable!;
}

/**
 * Compute Zobrist hash for a complete board state
 * 
 * @param board - Array of 26 numbers representing checker positions
 *                Positive = white checkers, Negative = black checkers
 * @returns 64-bit BigInt hash uniquely identifying this board state
 * 
 * @example
 * const board = [0, -2, 0, 0, 0, 0, 5, ...]; // Initial Backgammon setup
 * const hash = hashBoard(board); // 18014398509481985n
 */
export function hashBoard(board: number[]): bigint {
  const table = getZobristTable();
  let hash = 0n;
  
  for (let point = 0; point < board.length; point++) {
    const checkers = board[point];
    if (!checkers) continue; // Skip empty points
    
    const pointMap = table.get(point);
    if (!pointMap) continue;
    
    const zobristValue = pointMap.get(checkers);
    if (zobristValue !== undefined) {
      hash ^= zobristValue; // XOR operation
    }
  }
  
  return hash;
}

/**
 * Incrementally update hash after a move (more efficient than rehashing entire board)
 * 
 * Formula: newHash = oldHash ^ zobrist[from][oldCount] ^ zobrist[to][newCount]
 * 
 * @param currentHash - Current board hash
 * @param move - Move being applied
 * @param board - Current board state (before move)
 * @returns New hash after move is applied
 * 
 * @example
 * const currentHash = hashBoard(board);
 * const move = { from: 8, to: 5, die: 3 };
 * const newHash = hashMove(currentHash, move, board);
 * // Equivalent to: hashBoard(applyMove(board, move, 'white'))
 */
export function hashMove(
  currentHash: bigint,
  move: Move,
  board: number[]
): bigint {
  const table = getZobristTable();
  let newHash = currentHash;
  
  const { from, to } = move;
  
  // Remove old state at origin
  const fromCheckers = board[from];
  if (fromCheckers) {
    const fromMap = table.get(from);
    const fromZobrist = fromMap?.get(fromCheckers);
    if (fromZobrist !== undefined) {
      newHash ^= fromZobrist;
    }
    
    // Add new state at origin (one less checker)
    const sign = fromCheckers > 0 ? 1 : -1;
    const newFromCheckers = fromCheckers - sign;
    if (newFromCheckers !== 0) {
      const newFromZobrist = fromMap?.get(newFromCheckers);
      if (newFromZobrist !== undefined) {
        newHash ^= newFromZobrist;
      }
    }
  }
  
  // Remove old state at destination
  const toCheckers = board[to];
  if (toCheckers) {
    const toMap = table.get(to);
    const toZobrist = toMap?.get(toCheckers);
    if (toZobrist !== undefined) {
      newHash ^= toZobrist;
    }
  }
  
  // Add new state at destination (one more checker of current color)
  const sign = fromCheckers && fromCheckers > 0 ? 1 : -1;
  const newToCheckers = (toCheckers ?? 0) + sign;
  const toMap = table.get(to);
  const newToZobrist = toMap?.get(newToCheckers);
  if (newToZobrist !== undefined) {
    newHash ^= newToZobrist;
  }
  
  return newHash;
}

/**
 * Reset Zobrist table (useful for testing with deterministic seeds)
 */
export function resetZobrist(): void {
  zobristTable = null;
}
