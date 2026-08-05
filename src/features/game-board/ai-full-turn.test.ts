/**
 * AI full-turn regression tests (replay 90bef31b).
 * BUGFIX (2026-08-01): the opening book gate used Math.abs() on the opponent's
 * back point, counting the AI's OWN stacked checkers as "opponent back checkers",
 * so it fired mid-game and picked a move that is only legal after another move
 * in the same sequence (e.g. 1->2 while black is on the bar). The AI then played
 * a one-die turn. These tests pin the fix: the AI must use every legal die.
 */
import { describe, it, expect, vi } from 'vitest';
import { getGrandmasterMove } from './ai-service';
import { isValidMove, applyMove } from '../../entities/game/rules';
import type { GameState } from '../../entities/game/types';

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

// T14 from replay 90bef31b: black on the bar, dice [4,1]. The opening book used
// to fire because board[24] = -3 (three of black's OWN checkers) was read as
// "white still stacked on its back point" via Math.abs, and then played 1->2
// (illegal as a first move while on the bar) leaving the turn with one die.
function boardT14(): number[] {
  const b = Array(30).fill(0);
  b[1] = -2; b[5] = 2; b[6] = 5; b[8] = 4; b[9] = 1; b[10] = 1;
  b[12] = -2; b[13] = 1; b[18] = 1; b[22] = -5; b[23] = -2; b[24] = -3;
  b[27] = -1;
  return b;
}

// T28 from replay 90bef31b: black dice [1,3]. Same bug fired (board[24] = -3),
// producing a 1-move turn.
function boardT28(): number[] {
  const b = Array(30).fill(0);
  b[1] = -3; b[2] = 3; b[3] = 3; b[4] = 3; b[5] = 4; b[6] = 2;
  b[15] = -1; b[16] = -1; b[22] = -4; b[23] = -3; b[24] = -3;
  return b;
}

async function assertFullLegalTurn(board: number[], dice: number[], turn: 'white' | 'black') {
  const state = makeState(board, dice, turn);
  const result = await getGrandmasterMove(board, dice, state, 10);

  expect(result).not.toBeNull();
  expect(result!.moves.length).toBe(dice.length);

  let simBoard = [...board];
  let usedDice: number[] = [];
  for (const m of result!.moves) {
    const validation = isValidMove({ ...state, board: simBoard, usedDice }, m);
    expect(validation.valid, `move ${m.from}->${m.to} die ${m.die}: ${validation.reason}`).toBe(true);
    simBoard = applyMove(simBoard, m, turn);
    usedDice = [...usedDice, m.die];
  }
}

describe('AI uses every legal die (replay 90bef31b)', () => {
  it('T14: black on the bar with [4,1] must play both dice', async () => {
    await assertFullLegalTurn(boardT14(), [4, 1], 'black');
  });

  it('T28: black with [1,3] must play both dice', async () => {
    await assertFullLegalTurn(boardT28(), [1, 3], 'black');
  });
});
