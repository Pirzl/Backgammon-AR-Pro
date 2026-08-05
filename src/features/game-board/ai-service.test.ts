/**
 * AI Service Tests
 * - L9-10 opening book uses the exact expert table.
 * - getGrandmasterMove never skips a legal turn: when the full-turn sequence
 *   generator returns nothing but legal moves exist, it falls back to greedy play.
 * - A genuinely blocked position returns an empty move list (a legal skip).
 */
import { describe, it, expect, vi } from 'vitest';
import { getGrandmasterMove, effectiveCandidateScore, selectBestSequence } from './ai-service';
import { isValidMove, applyMove } from '../../entities/game/rules';
import { INITIAL_BOARD, BAR_BLACK } from '../../entities/game/constants';
import type { GameState } from '../../entities/game/types';

// The full-turn generator is forced to produce an empty sequence set, simulating
// the scenario where the search produces nothing while legal moves still exist.
vi.mock('../../entities/game/full-turn-generator', () => ({
  generateAllTurnSequences: () => [[]],
}));

vi.mock('../ai-worker/api', () => ({
  fetchEvaluation: vi.fn(async () => null),
  storeEvaluation: vi.fn(async () => {}),
}));

vi.mock('../../shared/api/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
        })),
        or: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
      })),
    })),
  },
}));

vi.mock('../ai-worker/skills', () => ({
  buildSkillContext: vi.fn(async () => ({
    state: null,
    aiColor: 'black',
    board: [],
    dice: [],
    weights: undefined,
    profile: null,
    history: null,
    innovate: false,
  })),
  planForContext: vi.fn(() => []),
}));

vi.mock('./nn-model', () => ({
  nnModel: {
    evaluate: vi.fn(async () => 0),
    load: vi.fn(async () => {}),
    applyLocalWeights: vi.fn(async () => {}),
  },
}));

function makeState(board: number[], dice: number[], turn: 'white' | 'black'): GameState {
  return {
    board,
    turn,
    dice,
    usedDice: [],
    cube: 1,
    cubeOwner: null,
    crawford: false,
    matchScore: { white: 0, black: 0 },
    winner: null,
  };
}

describe('getGrandmasterMove (L9-10)', () => {
  it('uses the exact expert opening for 3-1 (black: 17->20 with the 3, 19->20 with the 1)', async () => {
    const board = [...INITIAL_BOARD];
    const dice = [3, 1];
    const result = await getGrandmasterMove(board, dice, makeState(board, dice, 'black'), 10);

    expect(result).not.toBeNull();
    expect(result!.moves).toEqual([
      { from: 17, to: 20, die: 3 },
      { from: 19, to: 20, die: 1 },
    ]);
  });

  it('never skips a legal turn: empty sequence set falls back to greedy moves', async () => {
    const board = new Array(30).fill(0);
    board[10] = -1; // black checker that can move
    board[9] = 1;   // white checker nearby (harmless)
    const dice = [1, 2];
    const state = makeState(board, dice, 'black');

    const result = await getGrandmasterMove(board, dice, state, 10);

    expect(result).not.toBeNull();
    expect(result!.moves.length).toBeGreaterThan(0);

    // Every returned move must be legal on the evolving board.
    let simBoard = [...board];
    let usedDice: number[] = [];
    for (const m of result!.moves) {
      const validation = isValidMove({ ...state, board: simBoard, usedDice }, m);
      expect(validation.valid).toBe(true);
      simBoard = applyMove(simBoard, m, 'black');
      usedDice = [...usedDice, m.die];
    }
  });

  it('returns an empty move list (legal skip) when the position is truly blocked', async () => {
    const board = new Array(30).fill(0);
    board[BAR_BLACK] = -1;          // black on the bar
    for (let i = 1; i <= 6; i++) board[i] = 2; // white owns every entry point
    const dice = [1, 2];
    const state = makeState(board, dice, 'black');

    const result = await getGrandmasterMove(board, dice, state, 10);

    expect(result).toEqual({ moves: [] });
  });
});

describe('effectiveCandidateScore (reflect precedence regression)', () => {
  it('uses the reflective score when chosenBy is reflect', () => {
    expect(effectiveCandidateScore('reflect', -11.01, -4.48)).toBe(-4.48);
  });

  it('uses the raw score when chosenBy is base', () => {
    expect(effectiveCandidateScore('base', -4.48, -11.01)).toBe(-4.48);
  });

  it('does NOT let a reflect-marked sequence beat a better base best unconditionally', () => {
    // Regression for BUGFIX: previously `chosenBy === 'reflect' ? reflectiveScore : score > best`
    // parsed as a ternary, so ANY reflect-marked sequence (nonzero number) won.
    // Here reflect score is worse than the current best; it must NOT win.
    const chosenBy: 'reflect' = 'reflect';
    const score = -11.01;
    const reflectiveScore = -9.56;
    const bestScore = -4.48;
    expect(effectiveCandidateScore(chosenBy, score, reflectiveScore) > bestScore).toBe(false);
  });
});

describe('selectBestSequence (2026-08-03 delta double-count regression)', () => {
  // Old logic reused bestScore (already base+delta when reflect-marked) in
  // baseReflectiveScore, double-counting the best's delta. That made the pick
  // order-dependent. Fixed: the best's delta is applied exactly once.
  it('does not double-count the best candidate delta: applies it once', () => {
    // scores [0,0,0], deltas [-15,-15,0]:
    //  - fixed: candidate 1 (its -15 delta is compared once) wins
    //  - old (double-count): candidate 2 wins
    const candidates = [
      { score: 0, delta: -15 },
      { score: 0, delta: -15 },
      { score: 0, delta: 0 },
    ];
    const { index } = selectBestSequence(candidates);
    expect(index).toBe(1);
  });

  it('returns the effective score of the winner', () => {
    const { index, effectiveScore } = selectBestSequence([
      { score: 13.97, delta: -20.9 },
      { score: 12.4, delta: -21.41 },
      { score: 3.74, delta: -49.7 },
    ]);
    // i0 wins by reflect (-6.93); i1 is NOT reflect-marked (its -9.01 loses to
    // baseRef -6.93) so it competes on raw score 12.4 and beats -6.93.
    expect(index).toBe(1);
    expect(effectiveScore).toBeCloseTo(12.4, 2);
  });

  it('ignores the reflective override when all deltas are null (skills off)', () => {
    const candidates = [
      { score: 5, delta: null },
      { score: 12, delta: null },
      { score: 8, delta: null },
    ];
    const { index } = selectBestSequence(candidates);
    expect(index).toBe(1); // highest raw score wins
  });

  it('keeps the highest reflective score even when the base best is first', () => {
    // First candidate has the best raw score but a huge negative delta; a later
    // candidate has a slightly lower raw score but a much milder delta and wins.
    const candidates = [
      { score: 20, delta: -18 },
      { score: 12, delta: -1 },
    ];
    const { index } = selectBestSequence(candidates);
    expect(index).toBe(1);
  });
});
