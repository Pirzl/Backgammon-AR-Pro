/**
 * LRU Cache for AI Position Evaluations
 * In-memory cache layer to avoid Supabase network latency
 * Max size: 10,000 positions (typically ~1-2MB)
 */

import type { Evaluation } from './api';

const positionCache = new Map<string, Evaluation>();
const MAX_CACHE_SIZE = 10000;

/**
 * Get cached evaluation for a position
 * @param hash - Zobrist hash (BigInt)
 * @returns Cached evaluation or null
 */
export function getCached(hash: bigint): Evaluation | null {
  const key = hash.toString();
  const cached = positionCache.get(key);
  
  if (cached) {
    // Move to end (LRU access)
    positionCache.delete(key);
    positionCache.set(key, cached);
  }
  
  return cached ?? null;
}

/**
 * Store evaluation in cache
 * @param hash - Zobrist hash (BigInt)
 * @param evaluation - Position evaluation
 */
export function setCached(hash: bigint, evaluation: Evaluation): void {
  const key = hash.toString();
  
  // Evict oldest if at capacity
  if (positionCache.size >= MAX_CACHE_SIZE && !positionCache.has(key)) {
    const firstKey = positionCache.keys().next().value;
    if (firstKey) {
      positionCache.delete(firstKey);
    }
  }
  
  positionCache.set(key, evaluation);
}

/**
 * Clear all cache entries (useful for testing)
 */
export function clearCache(): void {
  positionCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: positionCache.size,
    maxSize: MAX_CACHE_SIZE,
    utilization: (positionCache.size / MAX_CACHE_SIZE) * 100,
  };
}
