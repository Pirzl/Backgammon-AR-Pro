/**
 * Critical Rules Tests
 * Tests for doubles, bar entry, and forced higher die
 */

import { describe, it, expect } from 'vitest';
import { isValidMove } from './rules';
import { rollDice, validateDiceUsage, canPlayBothDice } from './utils';
import { BAR_WHITE, BAR_BLACK, BOARD_SIZE } from './constants';
import type { GameState, Move } from './types';

describe('Critical Backgammon Rules', () => {
  describe('Doubles Logic', () => {
    it('rollDice returns 4 instances for doubles', () => {
      // Mock Math.random to return doubles
      const originalRandom = Math.random;
      Math.random = () => 0.4; // Will give us 3-3
      
      const dice = rollDice();
      expect(dice).toEqual([3, 3, 3, 3]);
      expect(dice.length).toBe(4);
      
      Math.random = originalRandom;
    });

    it('rollDice returns 2 instances for non-doubles', () => {
      const originalRandom = Math.random;
      Math.random = (() => {
        let calls = 0;
        return () => calls++ === 0 ? 0.1 : 0.5; // 1 and 4
      })();
      
      const dice = rollDice();
      expect(dice.length).toBe(2);
      expect(dice).toContain(1);
      expect(dice).toContain(4);
      
      Math.random = originalRandom;
    });
  });

  describe('Bar Entry Calculation', () => {
    it('white enters from bar into black home (points 19-24)', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [3],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      state.board[BAR_WHITE] = 1; // White on bar
      
      // White rolling 3 should enter on point 22 (25-3=22)
      const move: Move = { from: BAR_WHITE, to: 22, die: 3 };
      const result = isValidMove(state, move);
      
      expect(result.valid).toBe(true);
    });

    it('black enters from bar into white home (points 1-6)', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'black',
        dice: [5],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      state.board[BAR_BLACK] = -1; // Black on bar
      
      // Black rolling 5 should enter on point 5
      const move: Move = { from: BAR_BLACK, to: 5, die: 5 };
      const result = isValidMove(state, move);
      
      expect(result.valid).toBe(true);
    });

    it('cannot enter on blocked point', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [2],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      state.board[BAR_WHITE] = 1; // White on bar
      state.board[23] = -2; // Black owns point 23 (25-2=23)
      
      const move: Move = { from: BAR_WHITE, to: 23, die: 2 };
      const result = isValidMove(state, move);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Destination blocked by opponent');
    });
  });

  describe('Forced Higher Die Rule', () => {
    it('enforces playing higher die when only one can be played', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [6, 2],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // Setup: White can only move with 6, not 2
      state.board[10] = 1;  // White checker on 10
      state.board[8] = -2;  // Black blocks point 8 (10-2=8 is blocked)
      state.board[4] = 0;   // Point 4 is open (10-6=4 is valid)
      
      // Trying to play the 2 should fail
      const validation = validateDiceUsage(state, 2);
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Must play higher die');
    });

    it('allows either die when both can be played', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [3, 5],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      state.board[10] = 2; // White checkers on 10
      
      const canPlayBoth = canPlayBothDice(state);
      expect(canPlayBoth).toBe(true);
      
      const validation3 = validateDiceUsage(state, 3);
      const validation5 = validateDiceUsage(state, 5);
      
      expect(validation3.valid).toBe(true);
      expect(validation5.valid).toBe(true);
    });
  });
});
