/**
 * Supabase API for AI Evaluations
 * Persistent transposition table using Zobrist hashes as keys
 * 
 * CRITICAL: BigInt Safety
 * - Postgres BIGINT is 64-bit signed integer
 * - JavaScript Number is 53-bit precision (loses data!)
 * - MUST query as `id::text` and convert to BigInt
 */

import { supabase } from '../../shared/api/supabase';
import type { Move } from '../../entities/game/types';
import { updatePlayerRank } from '../ranking/api';

const MAX_CACHE_ENTRIES = 2048;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

type CacheValue = { evaluation: Evaluation; expiresAt: number };
const memoryCache = new Map<string, CacheValue>();

function trimCache() {
  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, value] of memoryCache) {
    if (value.expiresAt < now) memoryCache.delete(key);
  }
  {
    const now2 = Date.now();
    for (const [key, value] of memoryCache) {
      if (value.expiresAt < now2) memoryCache.delete(key);
    }
  }
  while (memoryCache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]!;
    memoryCache.delete(oldest[0]);
  }
}

/**
 * Stored evaluation for a board position
 */
export interface Evaluation {
  id: string;        // Zobrist hash as string (for BigInt safety)
  equity: number;    // Position value (-1 to +1, from AI perspective)
  best_move: Move | null;   // Recommended move (null if no valid move)
  depth: number;     // Search depth used
  created_at?: string;
}

/**
 * Fetch cached evaluation from Supabase
 * 
 * BigInt Safety: We pass the hash as a string to `.eq()`.
 * PostgREST correctly compares string-to-bigint without precision loss.
 * We don't select the `id` field back to avoid JS Number precision issues.
 * 
 * @param hash - Zobrist hash (BigInt)
 * @returns Cached evaluation or null if not found
 */
export async function fetchEvaluation(hash: bigint): Promise<Evaluation | null> {
  const hashStr = BigInt.asIntN(64, hash).toString();
  const now = Date.now();
  const cached = memoryCache.get(hashStr);
  if (cached && cached.expiresAt >= now) {
    return cached.evaluation;
  }
  if (cached) memoryCache.delete(hashStr);

  const { data, error } = await supabase
    .from('zobrist_evaluations')
    .select('equity, best_move, depth, created_at')
    .eq('id', hashStr)
    .maybeSingle();

  if (error) {
    console.warn('Zobrist cache error:', error.code, error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const evaluation = { id: hashStr, ...data } as Evaluation;
  memoryCache.set(hashStr, { evaluation, expiresAt: now + CACHE_TTL_MS });
  trimCache();
  return evaluation;
}

/**
 * Store evaluation in Supabase transposition table
 * 
 * @param hash - Zobrist hash (BigInt)
 * @param evaluation - Position evaluation
 * 
 * @example
 * const hash = hashBoard(board);
 * await storeEvaluation(hash, {
 *   equity: 0.75,
 *   best_move: { from: 8, to: 5, die: 3 },
 *   depth: 2
 * });
 */
export async function storeEvaluation(
  hash: bigint,
  evaluation: Omit<Evaluation, 'id' | 'created_at'>
): Promise<void> {
  const hashStr = BigInt.asIntN(64, hash).toString();
  
  const { error } = await supabase
    .from('zobrist_evaluations')
    .upsert({
      id: hashStr, // Postgres will cast string to bigint
      equity: evaluation.equity,
      best_move: evaluation.best_move,
      depth: evaluation.depth,
    });
  
  if (error) {
    console.error('Supabase store error:', error);
  }
}

/**
 * Batch store multiple evaluations (more efficient than individual inserts)
 * 
 * @param evaluations - Map of hash → evaluation
 * 
 * @example
 * const batch = new Map([
 *   [hash1, { equity: 0.5, best_move: move1, depth: 2 }],
 *   [hash2, { equity: -0.3, best_move: move2, depth: 2 }],
 * ]);
 * await batchStore(batch);
 */
export async function batchStore(
  evaluations: Map<bigint, Omit<Evaluation, 'id' | 'created_at'>>
): Promise<void> {
  if (evaluations.size === 0) return;
  
  const rows = Array.from(evaluations.entries()).map(([hash, evaluation]) => ({
    id: BigInt.asIntN(64, hash).toString(),
    equity: evaluation.equity,
    best_move: evaluation.best_move,
    depth: evaluation.depth,
  }));
  
  const { error } = await supabase
    .from('zobrist_evaluations')
    .upsert(rows);
  
  if (error) {
    console.error('Supabase batch store error:', error);
  }
}


/**
 * Clear all evaluations (useful for testing or AI version updates)
 * USE WITH CAUTION: This deletes the entire transposition table!
 */
export async function clearEvaluations(): Promise<void> {
  const { error } = await supabase
    .from('zobrist_evaluations')
    .delete()
    .neq('id', '0'); // Delete all rows
  
  if (error) {
    console.error('Supabase clear error:', error);
  }
}

/**
 * Save game result to Supabase for learning/stats
 */
export async function saveGameResult(
  winner: string,
  loser: string,
  method: 'normal' | 'gammon' | 'backgammon',
  score: number,
  boardHash: bigint,
  whitePlayerId?: string | null,
  blackPlayerId?: string | null
): Promise<void> {
  const hashStr = BigInt.asIntN(64, boardHash).toString();
  
  const { error } = await supabase
    .from('game_logs')
    .insert({
      winner: winner,
      winner_color: winner,
      loser_color: loser,
      win_method: method,
      score_delta: score,
      board_hash: hashStr,
      move_chosen: {}, // Satisfy NOT NULL constraint
      played_at: new Date().toISOString(),
      white_player_id: whitePlayerId || null,
      black_player_id: blackPlayerId || null
    });

  if (error) {
    console.error('Failed to save game result:', error);
  } else {
    console.log('Game result saved to Supabase');
    // Trigger Rank Update (Fire and forget)
    if (whitePlayerId) updatePlayerRank(whitePlayerId).catch(err => console.error('Rank Update Failed White:', err));
    if (blackPlayerId) updatePlayerRank(blackPlayerId).catch(err => console.error('Rank Update Failed Black:', err));
  }
}

/**
 * Get AI Learning Statistics for "Wisdom Meter"
 * Returns count of unique learned positions and a normalized 0-100 score
 */
export async function getLearningStats(): Promise<{ count: number; wisdomScore: number }> {
  try {
    const { count, error } = await supabase
      .from('zobrist_evaluations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error fetching learning stats:', error);
      return { count: 0, wisdomScore: 0 };
    }

    const validCount = count ?? 0;
    // Formula: 500,000 positions = 100% Wisdom (Recalibrated from 100k)
    // Cap at 100
    const wisdomScore = Math.min(100, Math.floor((validCount / 500000) * 100));

    return { count: validCount, wisdomScore };
  } catch (err) {
    console.error('Unexpected error fetching stats:', err);
    return { count: 0, wisdomScore: 0 };
  }
}
