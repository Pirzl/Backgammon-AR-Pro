/**
 * Game Rules Tests
 * Critical test cases for Backgammon logic
 */

import { describe, it, expect } from 'vitest';
import {
  isValidMove,
  canBearOff,
  allCheckersHome,
  applyMove,
} from './rules';
import { INITIAL_BOARD, BAR_WHITE, BAR_BLACK, BOARD_SIZE } from './constants';
import type { GameState, Move } from './types';

describe('Backgammon Rules', () => {
  describe('Bar Entry', () => {
    it('must enter from bar before moving other checkers', () => {
      const state: GameState = {
        board: [...INITIAL_BOARD],
        turn: 'white',
        dice: [3, 5],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // Put white checker on bar
      state.board[BAR_WHITE] = 1;
      state.board[6] = 4; // Remove one from point 6
      
      // Try to move from point 8 (should fail)
      const invalidMove: Move = { from: 8, to: 5, die: 3 };
      const result = isValidMove(state, invalidMove);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Must enter from bar first');
    });
  });

  describe('Bear-off Logic', () => {
    it('cannot bear off if checkers are not all home', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [6],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // White home board: points 1-6
      state.board[3] = 2;
      state.board[8] = 1; // One checker outside home!
      
      const result = canBearOff(state.board, 3, 6, 'white');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Not all checkers are home');
    });

    it('allows bear-off with higher die if no checkers on higher points', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [6],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // All white checkers home
      state.board[2] = 3; // Point 2
      // No checkers on higher points (3, 4, 5, 6)
      
      // Try to bear off from point 2 with die 6 (overshoots)
      const result = canBearOff(state.board, 2, 6, 'white');
      expect(result.valid).toBe(true); // Should allow
    });

    it('forbids bear-off with higher die if checkers exist on higher points', () => {
      const state: GameState = {
        board: new Array(BOARD_SIZE).fill(0),
        turn: 'white',
        dice: [6],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // White home board
      state.board[4] = 1; // Point 4 (higher than 3)
      state.board[3] = 2; // Point 3
      
      // Try to bear off from point 3 with die 6
      const result = canBearOff(state.board, 3, 6, 'white');
      expect(result.valid).toBe(false); // Should fail because point 4 has a checker
      expect(result.reason).toBe('Must use die for higher point');
    });
  });

  describe('Blocked Moves', () => {
    it('cannot move to point with 2+ opponent checkers', () => {
      const state: GameState = {
        board: [...INITIAL_BOARD],
        turn: 'white',
        dice: [2],
        usedDice: [],
        cube: 1,
        cubeOwner: null,
        crawford: false,
        matchScore: { white: 0, black: 0 },
        winner: null,
      };
      
      // White tries to move from 8 to 6, but point 6 has 5 white checkers
      // Change point 6 to have 2 black checkers (blocking)
      state.board[6] = -2;
      
      const move: Move = { from: 8, to: 6, die: 2 };
      const result = isValidMove(state, move);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Destination blocked by opponent');
    });

    it('allows hitting a blot (single opponent checker)', () => {
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
      
      state.board[8] = 1;  // White checker
      state.board[5] = -1; // Single black checker (blot)
      
      const move: Move = { from: 8, to: 5, die: 3 };
      const result = isValidMove(state, move);
      
      expect(result.valid).toBe(true);
      
      // Verify hit sends checker to bar
      const newBoard = applyMove(state.board, move, 'white');
      expect(newBoard[BAR_BLACK]).toBe(-1); // Black checker on bar
      expect(newBoard[5]).toBe(1);    // White checker on point 5
    });
  });

  describe('All Checkers Home Check', () => {
    it('returns true when all checkers are in home board', () => {
      const board = new Array(BOARD_SIZE).fill(0);
      board[1] = 2;
      board[3] = 3;
      board[6] = 5; // All in white home (1-6)
      
      expect(allCheckersHome(board, 'white')).toBe(true);
    });

    it('returns false when checker is on bar', () => {
      const board = new Array(BOARD_SIZE).fill(0);
      board[BAR_WHITE] = 1; // White checker on bar
      board[3] = 4;
      
      expect(allCheckersHome(board, 'white')).toBe(false);
    });
  });
});
