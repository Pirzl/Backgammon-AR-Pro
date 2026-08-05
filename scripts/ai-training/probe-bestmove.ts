import { getBestMove } from './src/features/ai-worker/expectimax';
import { makeInitialGameState } from './src/features/ai-worker/training/self-play';

const state = makeInitialGameState();
const start = performance.now();
const result = await getBestMove(state, 2);
const ms = performance.now() - start;
console.log('depth=2', 'ms=' + Math.round(ms), 'seq=' + (result.move ? 1 : 0), 'value=' + (result.value ?? 0));
