/**
 * Supabase API Tests
 * Verify BigInt round-trip safety and CRUD operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchEvaluation, storeEvaluation, batchStore, clearEvaluations } from './api';
import type { Move } from '../../entities/game/types';

describe('Supabase API Integration', () => {
  // Test data
  const testHash = 18014398509481985n; // 2^54 + 1 (tests precision)
  const testMove: Move = { from: 8, to: 5, die: 3 };
  
  beforeAll(async () => {
    //Clear any existing test data
    await clearEvaluations();
  });
  
  afterAll(async () => {
    // Cleanup
    await clearEvaluations();
  });

  describe('BigInt Round-Trip Safety', () => {
    it('preserves 64-bit precision when storing and retrieving', async () => {
      // Store evaluation
      await storeEvaluation(testHash, {
        equity: 0.75,
        best_move: testMove,
        depth: 2,
      });
      
      // Retrieve evaluation
      const retrieved = await fetchEvaluation(testHash);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(testHash.toString());
      
      // Verify BigInt conversion preserves value
      const retrievedHash = BigInt(retrieved!.id);
      expect(retrievedHash).toBe(testHash);
    });

    it('handles maximum 64-bit values', async () => {
      const maxHash = BigInt('9223372036854775807'); // Max signed 64-bit
      
      await storeEvaluation(maxHash, {
        equity: 0.5,
        best_move: testMove,
        depth: 1,
      });
      
      const retrieved = await fetchEvaluation(maxHash);
      expect(retrieved?.id).toBe(maxHash.toString());
    });

    it('handles negative 64-bit values', async () => {
      const negativeHash = BigInt('-9223372036854775808'); // Min signed 64-bit
      
      await storeEvaluation(negativeHash, {
        equity: -0.5,
        best_move: testMove,
        depth: 1,
      });
      
      const retrieved = await fetchEvaluation(negativeHash);
      expect(retrieved?.id).toBe(negativeHash.toString());
    });
  });

  describe('CRUD Operations', () => {
    it('fetches null for non-existent hash', async () => {
      const nonExistentHash = 99999999999999999n;
      const result = await fetchEvaluation(nonExistentHash);
      expect(result).toBeNull();
    });

    it('stores and retrieves evaluation correctly', async () => {
      const hash = 12345678901234567n;
      const evaluation = {
        equity: 0.42,
        best_move: { from: 13, to: 10, die: 3 } as Move,
        depth: 2,
      };
      
      await storeEvaluation(hash, evaluation);
      const retrieved = await fetchEvaluation(hash);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.equity).toBe(0.42);
      expect(retrieved?.best_move).toEqual(evaluation.best_move);
      expect(retrieved?.depth).toBe(2);
    });

    it('upserts existing evaluation (overwrites)', async () => {
      const hash = 11111111111111111n;
      
      // First insert
      await storeEvaluation(hash, {
        equity: 0.1,
        best_move: testMove,
        depth: 1,
      });
      
      // Upsert (should overwrite)
      await storeEvaluation(hash, {
        equity: 0.9,
        best_move: { from: 6, to: 3, die: 3 },
        depth: 3,
      });
      
      const retrieved = await fetchEvaluation(hash);
      expect(retrieved?.equity).toBe(0.9); // Latest value
      expect(retrieved?.depth).toBe(3);
    });
  });

  describe('Batch Operations', () => {
    it('batch stores multiple evaluations', async () => {
      const batch = new Map([
        [20001n, { equity: 0.5, best_move: testMove, depth: 2 }],
        [20002n, { equity: 0.6, best_move: testMove, depth: 2 }],
        [20003n, { equity: 0.7, best_move: testMove, depth: 2 }],
      ]);
      
      await batchStore(batch);
      
      // Verify all stored
      const evaluation1 = await fetchEvaluation(20001n);
      const evaluation2 = await fetchEvaluation(20002n);
      const evaluation3 = await fetchEvaluation(20003n);
      
      expect(evaluation1?.equity).toBe(0.5);
      expect(evaluation2?.equity).toBe(0.6);
      expect(evaluation3?.equity).toBe(0.7);
    });

    it('handles empty batch', async () => {
      const emptyBatch = new Map();
      await expect(batchStore(emptyBatch)).resolves.not.toThrow();
    });

    it('batch handles large datasets (100 rows)', async () => {
      const largeBatch = new Map();
      
      for (let i = 0; i < 100; i++) {
        const hash = BigInt(30000 + i);
        largeBatch.set(hash, {
          equity: i / 100,
          best_move: testMove,
          depth: 2,
        });
      }
      
      await batchStore(largeBatch);
      
      // Spot check
      const first = await fetchEvaluation(30000n);
      const last = await fetchEvaluation(30099n);
      
      expect(first?.equity).toBe(0);
      expect(last?.equity).toBeCloseTo(0.99, 2);
    });
  });

  describe('Data Integrity', () => {
    it('preserves JSON structure of best_move', async () => {
      const hash = 40000n;
      const complexMove: Move = {
        from: 0, // Bar
        to: 22,
        die: 3,
      };
      
      await storeEvaluation(hash, {
        equity: 0.33,
        best_move: complexMove,
        depth: 1,
      });
      
      const retrieved = await fetchEvaluation(hash);
      expect(retrieved?.best_move).toEqual(complexMove);
      expect(retrieved?.best_move?.from).toBe(0);
      expect(retrieved?.best_move?.to).toBe(22);
    });

    it('handles edge case equity values', async () => {
      const testCases = [
        { hash: 50001n, equity: 1.0 },   // Perfect win
        { hash: 50002n, equity: -1.0 },  // Perfect loss
        { hash: 50003n, equity: 0.0 },   // Even position
        { hash: 50004n, equity: 0.001 }, // Very small advantage
      ];
      
      for (const testCase of testCases) {
        await storeEvaluation(testCase.hash, {
          equity: testCase.equity,
          best_move: testMove,
          depth: 1,
        });
        
        const retrieved = await fetchEvaluation(testCase.hash);
        expect(retrieved?.equity).toBeCloseTo(testCase.equity, 3);
      }
    });
  });
});
