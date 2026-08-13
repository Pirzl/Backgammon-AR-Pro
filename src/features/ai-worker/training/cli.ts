import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SelfPlayRunner } from './self-play';
import { aiModel } from '../nn-model';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEIGHTS_PATH = resolve(__dirname, '../../../../public/model_weights.json');

// Bump on every retrain so the browser cache-busts the old checkpoint.
const WEIGHTS_VERSION = 244664;

const runner = new SelfPlayRunner({
  depth: 3,
  oppCap: 45,
  storeTranspositions: false,
  whiteDepth: 3,
  blackDepth: 3,
  denseDepth: 3,
});

let games = 0;
const SAVE_EVERY = 1;

async function persist(): Promise<void> {
  const weights = aiModel.serializeWeights();
  if (weights.length === 0) return;
  const payload = {
    id: 'current',
    weights,
    trained_count: WEIGHTS_VERSION,
    total_updates: aiModel.getTotalWeightUpdates(),
    games_played: games,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(WEIGHTS_PATH, JSON.stringify(payload));
  console.log(`[Persist] wrote ${weights.length} layers to public/model_weights.json (v=${WEIGHTS_VERSION})`);
}

runner.runForever(async (game) => {
  games++;
  console.log(JSON.stringify({
    winner: game.winner,
    method: game.method,
    movesPlayed: game.movesPlayed,
    gameTimeMs: Math.round(game.gameTimeMs ?? 0),
    positions: game.positions.length,
    totalGames: games,
  }));
  if (games % SAVE_EVERY === 0) {
    await persist();
  }
});
