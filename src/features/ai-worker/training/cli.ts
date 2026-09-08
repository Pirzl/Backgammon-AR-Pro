/**
 * Headless self-play training CLI (Phase 1).
 *
 * Usage:
 *   tsx src/features/ai-worker/training/cli.ts [--games=200] [--exploration=0.2]
 *       [--max-moves=300] [--max-sequences=96] [--save-every=10]
 *       [--eval-every=25] [--eval-games=40] [--epochs=3]
 *       [--nn-blend=1] [--self-play-blend=1] [--opponent=self|heuristic]
 *       [--label=td0|outcome]
 *
 * Trains the 198→40→1 NN via self-play. Training is ON-POLICY: after each game
 * the net is fit on that game's positions (real outcome ±1 labels) only, a few
 * epochs — the TD-Gammon recipe. Fitting a large replay buffer repeatedly
 * overfits the net to memorized positions and it stops generalizing to fresh
 * tournament positions, so no replay buffer is used. The periodic eval measures
 * the PURE-NN winrate against the static heuristic via runTournament()
 * (--nn-blend), which is the honest "master" criterion.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SelfPlayRunner } from './self-play';
import { aiModel } from '../nn-model';
import { runTournament } from './tournament';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEIGHTS_PATH = resolve(__dirname, '../../../../public/model_weights.json');

const args = process.argv.slice(2);
const argNum = (flag: string, def: number): number => {
  const raw = args.find(a => a.startsWith(`${flag}=`));
  const n = raw !== undefined ? Number(raw.split('=')[1]) : NaN;
  return Number.isFinite(n) ? n : def;
};

const GAMES = argNum('--games', 200);
const EXPLORATION = argNum('--exploration', 0.2);
const MAX_MOVES = argNum('--max-moves', 300);
const MAX_SEQUENCES = argNum('--max-sequences', 96);
const SAVE_EVERY = argNum('--save-every', 10);
const EVAL_EVERY = argNum('--eval-every', 25);
const EVAL_GAMES = argNum('--eval-games', 40);
const EPOCHS = argNum('--epochs', 3);
const NN_BLEND = argNum('--nn-blend', 1.0);
const SELF_PLAY_BLEND = argNum('--self-play-blend', 1.0);
// Auto-stop: once STOP_STREAK consecutive evals reach >= STOP_RATE, exit cleanly
// so Colab/GPU runs can be fire-and-forget (no manual Interrupt needed).
const STOP_RATE = argNum('--stop-rate', 0.60);
const STOP_STREAK = argNum('--stop-streak', 2);
const OPPONENT = args.includes('--opponent=heuristic') ? 'heuristic' : 'self';
const LABEL: 'outcome' | 'td0' = args.includes('--label=outcome') ? 'outcome' : 'td0';

const runner = new SelfPlayRunner({
  label: LABEL,
  blend: SELF_PLAY_BLEND,
  opponent: OPPONENT,
  exploration: EXPLORATION,
  maxSequences: MAX_SEQUENCES,
  maxMoves: MAX_MOVES,
  maxGames: GAMES,
});

async function persist(games: number): Promise<void> {
  const weights = aiModel.serializeWeights();
  if (weights.length === 0) return;
  const payload = {
    id: 'current',
    weights,
    trained_count: aiModel.getTrainedCount(),
    total_updates: aiModel.getTotalWeightUpdates(),
    games_played: games,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(WEIGHTS_PATH, JSON.stringify(payload));
  console.log(`[Persist] wrote ${weights.length} layers to public/model_weights.json (trained_count=${payload.trained_count}, games=${games})`);
}

async function main(): Promise<void> {
  // En Colab/GPU: tfjs-node-gpu debe importarse ANTES que @tensorflow/tfjs.
  // En local/CPU cae a @tensorflow/tfjs normal. Nunca afecta al build del navegador
  // (cli.ts está excluido de tsconfig.app.json).
  try {
    await import('@tensorflow/tfjs-node-gpu');
    console.log('[GPU] tfjs-node-gpu activado');
  } catch {
    console.log('[GPU] tfjs-node-gpu no disponible, usando CPU/JS backend');
  }
  await aiModel.ensureModel();
  let consecutivePass = 0;

  await runner.runForever(async (game) => {
    // On-policy: fit on THIS game's positions only (TD-Gammon recipe).
    if (game.positions.length > 0) {
      await aiModel.trainOnGame(game.positions, EPOCHS);
    }

    const gamesDone = runner.totalGames;
    console.log(JSON.stringify({
      event: 'game',
      game: gamesDone,
      winner: game.winner,
      method: game.method,
      movesPlayed: game.movesPlayed,
      positions: game.positions.length,
      trainedCount: aiModel.getTrainedCount(),
    }));

    if (gamesDone % SAVE_EVERY === 0) {
      await persist(gamesDone);
    }

    if (EVAL_EVERY > 0 && gamesDone % EVAL_EVERY === 0) {
      try {
        const t = await runTournament({ games: EVAL_GAMES, blend: NN_BLEND, nn: aiModel });
        console.log(JSON.stringify({ event: 'eval', game: gamesDone, ...t }));
        const rate = (t as unknown as { nnWinRate?: number }).nnWinRate ?? (t as unknown as { rate?: number }).rate ?? 0;
        if (rate >= STOP_RATE) {
          consecutivePass++;
          if (consecutivePass >= STOP_STREAK) {
            console.log(`[AutoStop] ${STOP_STREAK} consecutive evals >= ${STOP_RATE} -> stopping at game ${gamesDone}`);
            await persist(gamesDone);
            process.exit(0);
          }
        } else {
          consecutivePass = 0;
        }
      } catch (e) {
        console.warn('[Eval] tournament failed:', e);
      }
    }
  });

  await persist(runner.totalGames);
  console.log(JSON.stringify({ event: 'done', games: runner.totalGames }));
}

main().catch(err => {
  console.error('CLI_ERROR=' + String(err));
  process.exit(1);
});
