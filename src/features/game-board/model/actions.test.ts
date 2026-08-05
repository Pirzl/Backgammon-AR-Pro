/**
 * Reducer tests for the CONFIRM_TURN_END data-recording fix (2026-08-03):
 * `turn_number` must be a global per-game turn counter, not the in-turn move
 * count. `turn_count` is incremented on every CONFIRM_TURN_END and reported as
 * `turn_number` when the row is inserted into `game_history_analysis`.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../shared/api/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({
        then: (cb: (r: { error: null }) => unknown) => Promise.resolve(cb({ error: null })),
      }),
    }),
  },
}));

vi.mock('../ai-service', () => ({
  generateEvaluationScore: vi.fn(async () => ({ evaluation: 'mock', score: 0 })),
}));

import { gameReducer } from './actions';
import type { UIGameState } from './types';

function baseState(over: Partial<UIGameState> = {}): UIGameState {
  return {
    game_id: 'g1',
    board: new Array(30).fill(0),
    turn: 'white',
    dice: [2, 3],
    usedDice: [],
    cube: 1,
    cubeOwner: null,
    crawford: false,
    matchScore: { white: 0, black: 0 },
    winner: null,
    history: [],
    rollHistory: [],
    isRolling: false,
    needsTurnConfirmation: false,
    turn_count: 0,
    ...over,
  };
}

describe('gameReducer CONFIRM_TURN_END (turn_count)', () => {
  it('increments turn_count and switches the turn', async () => {
    const next = await gameReducer(baseState({ turn_count: 3 }), { type: 'CONFIRM_TURN_END' });
    expect(next.turn_count).toBe(4);
    expect(next.turn).toBe('black');
  });

  it('treats states loaded before turn_count existed as 0 (?? 0)', async () => {
    const stale = baseState() as UIGameState;
    delete (stale as { turn_count?: number }).turn_count;
    const next = await gameReducer(stale, { type: 'CONFIRM_TURN_END' });
    expect(next.turn_count).toBe(1);
  });
});
