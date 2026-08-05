import { SelfPlayRunner } from '../../src/features/ai-worker/training/self-play';
import { aiModel } from '../../src/features/ai-worker/nn-model';

async function main() {
  const rounds = Number(process.argv[2] ?? '50');
  const depth = Number(process.argv[3] ?? '2');
  const runner = new SelfPlayRunner({ depth, storeTranspositions: true });

  let wins = 0;
  let losses = 0;
  let totalMoves = 0;
  let totalLoss = 0;
  const start = performance.now();

  await aiModel.ensureModel();

  for (let r = 0; r < rounds; r++) {
    const game = await runner.playOneGame();
    if (game.winner === 'white') wins++;
    else losses++;
    totalMoves += game.movesPlayed ?? 0;

    const trainResult = await aiModel.trainOnGame(game.positions);
    totalLoss += typeof trainResult?.history?.loss?.[0] === 'number' ? trainResult.history.loss[0] : 0;

    console.log(
      JSON.stringify({
        event: 'game',
        round: r + 1,
        winner: game.winner,
        method: game.method,
        movesPlayed: game.movesPlayed,
        gameTimeMs: Math.round(game.gameTimeMs ?? 0),
        loss: typeof trainResult?.history?.loss?.[0] === 'number' ? Number(trainResult.history.loss[0].toFixed(4)) : null,
      })
    );
  }

  console.log(
    JSON.stringify({
      event: 'training_summary',
      depth,
      rounds,
      wins,
      losses,
      avgMoves: Math.round(totalMoves / rounds),
      avgLoss: totalLoss > 0 ? Number((totalLoss / rounds).toFixed(4)) : null,
      elapsedMs: Math.round(performance.now() - start),
      recordedGames: runner.recordedGames,
      trainedPositions: aiModel.getTrainedCount(),
    })
  );
}

main().catch(err => {
  console.error('RUNNER_ERROR=' + String(err));
  process.exit(1);
});
