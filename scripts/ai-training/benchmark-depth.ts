import { SelfPlayRunner } from '../../src/features/ai-worker/training/self-play';

async function main() {
  const depth = Number(process.argv[2] ?? '9');
  const rounds = Number(process.argv[3] ?? '10');

  let totalMs = 0;
  let maxMs = 0;
  let positions = 0;

  for (let r = 0; r < rounds; r++) {
    const runner = new SelfPlayRunner({ depth, storeTranspositions: false });
    const start = performance.now();
    const game = await runner.playOneGame();
    const ms = performance.now() - start;
    totalMs += ms;
    maxMs = Math.max(maxMs, ms);
    positions += game.positions?.length ?? 0;

    console.log(
      JSON.stringify({
        event: 'game',
        round: r + 1,
        winner: game.winner,
        method: game.method,
        movesPlayed: game.movesPlayed,
        gameTimeMs: Math.round(game.gameTimeMs ?? 0),
        wallMs: Math.round(ms),
      })
    );
  }

  console.log(
    JSON.stringify({
      event: 'summary',
      depth,
      rounds,
      avgMs: Math.round(totalMs / rounds),
      maxMs: Math.round(maxMs),
      totalPositions: positions,
    })
  );
}

main().catch(err => {
  console.error('RUNNER_ERROR=' + String(err));
  process.exit(1);
});
