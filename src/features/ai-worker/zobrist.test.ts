/**
 * Zobrist Hashing Tests
 * Verifies collision resistance, determinism, and incremental update correctness
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { hashBoard, hashMove, initializeZobrist, resetZobrist } from './zobrist';
import { INITIAL_BOARD } from '../../entities/game/constants';
import type { Move } from '../../entities/game/types';

describe('Zobrist Hashing', () => {
  beforeEach(() => {
    resetZobrist();
    initializeZobrist();
  });

  describe('Initialization', () => {
    it('initializes zobrist table on first hash', () => {
      resetZobrist();
      const hash = hashBoard(INITIAL_BOARD);
      expect(typeof hash).toBe('bigint');
      expect(hash).not.toBe(0n);
    });

    it('uses same table for subsequent hashes (deterministic)', () => {
      const hash1 = hashBoard(INITIAL_BOARD);
      const hash2 = hashBoard(INITIAL_BOARD);
      expect(hash1).toBe(hash2);
    });
  });

  describe('Hash Uniqueness', () => {
    it('produces unique hashes for different board states', () => {
      const board1 = [...INITIAL_BOARD];
      const board2 = [...INITIAL_BOARD];
      
      // Modify board2 slightly
      board2[6] = 4; // Change from 5 to 4 white checkers
      board2[7] = 1; // Move one checker
      
      const hash1 = hashBoard(board1);
      const hash2 = hashBoard(board2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('detects no collisions in 10,000 random boards', () => {
      const hashes = new Set<string>();
      const boardCount = 10_000;
      
      for (let i = 0; i < boardCount; i++) {
        const randomBoard = generateRandomBoard();
        const hash = hashBoard(randomBoard);
        const hashStr = hash.toString();
        
        if (hashes.has(hashStr)) {
          throw new Error(`Collision detected at iteration ${i}: ${hashStr}`);
        }
        
        hashes.add(hashStr);
      }
      
      expect(hashes.size).toBe(boardCount);
    });
  });

  describe('Incremental Hash Updates', () => {
    it('hashMove produces same result as rehashing entire board', () => {
      const board = [...INITIAL_BOARD];
      const currentHash = hashBoard(board);
      
      // Apply a move
      const move: Move = { from: 8, to: 5, die: 3 };
      const newHashIncremental = hashMove(currentHash, move, board);
      
      // Apply move to board and rehash
      const newBoard = [...board];
      newBoard[8] = (newBoard[8] ?? 0) - 1; // Remove white checker
      newBoard[5] = (newBoard[5] ?? 0) + 1; // Add white checker
      const newHashFull = hashBoard(newBoard);
      
      expect(newHashIncremental).toBe(newHashFull);
    });

    it('handles bar moves correctly', () => {
      const board = new Array(26).fill(0);
      board[0] = 1; // White on bar
      board[22] = -2; // Black owns point 22
      
      const currentHash = hashBoard(board);
      
      // White enters from bar to point 24 (rolling 1)
      const move: Move = { from: 0, to: 24, die: 1 };
      const newHash = hashMove(currentHash, move, board);
      
      // Verify by rehashing
      const newBoard = [...board];
      newBoard[0] = 0;
      newBoard[24] = 1;
      const expectedHash = hashBoard(newBoard);
      
      expect(newHash).toBe(expectedHash);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty board', () => {
      const emptyBoard = new Array(26).fill(0);
      const hash = hashBoard(emptyBoard);
      expect(hash).toBe(0n); // Empty board should have zero hash
    });

    it('handles board with all checkers on one point', () => {
      const board = new Array(26).fill(0);
      board[6] = 15; // All white checkers on point 6
      
      const hash = hashBoard(board);
      expect(hash).not.toBe(0n);
    });

    it('handles mixed positive and negative checkers', () => {
      const board = new Array(26).fill(0);
      board[6] = 5;   // White checkers
      board[19] = -5; // Black checkers
      
      const hash = hashBoard(board);
      expect(hash).not.toBe(0n);
    });
  });

  describe('BigInt Precision', () => {
    it('preserves full 64-bit precision', () => {
      const board = [...INITIAL_BOARD];
      const hash = hashBoard(board);
      
      // Verify hash is a valid 64-bit number
      expect(hash).toBeGreaterThanOrEqual(0n);
      expect(hash).toBeLessThanOrEqual(BigInt('18446744073709551615')); // 2^64 - 1
    });

    it('converts to string without precision loss', () => {
      const board = [...INITIAL_BOARD];
      const hash = hashBoard(board);
      const hashStr = hash.toString();
      const hashBack = BigInt(hashStr);
      
      expect(hashBack).toBe(hash);
    });
  });
});

// Helper function to generate random valid Backgammon board
function generateRandomBoard(): number[] {
  const board = new Array(26).fill(0);
  
  // Distribute 15 white checkers randomly
  let whiteRemaining = 15;
  while (whiteRemaining > 0) {
    const point = Math.floor(Math.random() * 24) + 1; // Points 1-24
    const count = Math.min(whiteRemaining, Math.floor(Math.random() * 5) + 1);
    board[point] = (board[point] ?? 0) + count;
    whiteRemaining -= count;
  }
  
  // Distribute 15 black checkers randomly
  let blackRemaining = 15;
  while (blackRemaining > 0) {
    const point = Math.floor(Math.random() * 24) + 1; // Points 1-24
    
    // Ensure point isn't occupied by white checkers (simplified)
    if (board[point] && board[point]! > 0) continue;
    
    const count = Math.min(blackRemaining, Math.floor(Math.random() * 5) + 1);
    board[point] = (board[point] ?? 0) - count;
    blackRemaining -= count;
  }
  
  return board;
}
