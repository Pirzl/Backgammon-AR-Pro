/**
 * Opening-book gate tests (over-stack repeat fix, 2026-08-02).
 *
 * The L9-10 expert table and the L7-8 bonus book must ONLY fire while our
 * checkers are still in the initial opening arrangement. Otherwise the book
 * re-applies the same opening when the same dice come again later and blindly
 * over-stacks a point the AI already built (found in expert replay 8e6238f8:
 * black T4 repeated 12->18,17->18, stacking 4 checkers on the 18-point).
 */
import { describe, it, expect } from 'vitest';
import { applyMove } from '../../entities/game/rules';
import { INITIAL_BOARD } from '../../entities/game/constants';
import { isOpeningSetup, getExpertOpeningSequence, getOpeningBook } from './opening-book';

describe('isOpeningSetup', () => {
  it('is true on the initial board for both colors', () => {
    expect(isOpeningSetup(INITIAL_BOARD, 'white')).toBe(true);
    expect(isOpeningSetup(INITIAL_BOARD, 'black')).toBe(true);
  });

  it('is false once a checker has moved from its starting point', () => {
    const moved = applyMove(INITIAL_BOARD, { from: 12, to: 18, die: 6 }, 'black');
    expect(isOpeningSetup(moved, 'black')).toBe(false);
    expect(isOpeningSetup(moved, 'white')).toBe(true);
  });
});

describe('getExpertOpeningSequence (L9-10 gate)', () => {
  it('fires on the initial opening for black 6-1', () => {
    expect(getExpertOpeningSequence([6, 1], INITIAL_BOARD, 'black')).toEqual([
      { from: 12, to: 18, die: 6 },
      { from: 17, to: 18, die: 1 },
    ]);
  });

  it('does NOT re-fire after the same opening was already played (over-stack fix)', () => {
    const after61 = [
      applyMove(INITIAL_BOARD, { from: 12, to: 18, die: 6 }, 'black'),
    ];
    const board = applyMove(after61[0]!, { from: 17, to: 18, die: 1 }, 'black');
    expect(getExpertOpeningSequence([6, 1], board, 'black')).toBeNull();
  });
});

describe('getOpeningBook (L7-8 gate)', () => {
  it('fires on the initial opening', () => {
    expect(getOpeningBook([1, 6], INITIAL_BOARD, 'black', 8)).not.toBeNull();
  });

  it('does NOT fire once our setup is no longer the opening arrangement', () => {
    const board = applyMove(INITIAL_BOARD, { from: 12, to: 18, die: 6 }, 'black');
    expect(getOpeningBook([1, 6], board, 'black', 8)).toBeNull();
  });
});
