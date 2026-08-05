import { getBestMove } from '../../src/features/ai-worker/expectimax';
import { INITIAL_BOARD } from '../../src/entities/game/constants';
import type { GameState } from '../../src/entities/game/types';

const state: GameState = {
  board: [...INITIAL_BOARD],
  turn: 'white',
  dice: [],
  usedDice: [],
  cube: 1,
  cubeOwner: null,
  crawford: false,
  matchScore: { white: 0, black: 0 },
  winner: null,
};

async function main() {
  const start = performance.now();
  const result = await getBestMove(state, 2);
  const ms = performance.now() - start;
  console.log(JSON.stringify({ depth: 2, move: result.move, value: result.value, ms }));
}

main().catch((err) => {
  console.error('PROBE_ERROR=' + String(err));
  process.exit(1);
});
