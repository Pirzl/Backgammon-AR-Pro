import { SelfPlayRunner } from '../../src/features/ai-worker/training/self-play';

async function main() {
  const rounds = 100;
  let blackWins = 0;
  let whiteWins = 0;
  let totalMoves = 0;
  let totalMs = 0;
  const methods: Record<string, number> = {};

  for (let r = 0; r < rounds; r++) {
    const runner = new SelfPlayRunner({ depth: 2, storeTranspositions: false });
    const game = await runner.playOneGame();

    if (game.winner === 'black') blackWins++;
    else whiteWins++;
    totalMoves += game.movesPlayed ?? 0;
    totalMs += game.gameTimeMs ?? 0;
    methods[game.method ?? 'unknown'] = (methods[game.method ?? 'unknown'] ?? 0) + 1;

    console.log(
      JSON.stringify({
        event: 'game',
        round: r + 1,
        winner: game.winner,
        method: game.method,
        movesPlayed: game.movesPlayed,
        gameTimeMs: Math.round(game.gameTimeMs ?? 0),
        positions: game.positions?.length ?? 0,
      })
    );
  }

  const summary = {
    event: 'summary',
    rounds,
    blackWins,
    whiteWins,
    avgMoves: Math.round(totalMoves / rounds),
    avgMs: Math.round(totalMs / rounds),
    methods,
  };
  console.log(JSON.stringify(summary));
}

main().catch(err => {
  console.error('RUNNER_ERROR=' + String(err));
  process.exit(1);
});
