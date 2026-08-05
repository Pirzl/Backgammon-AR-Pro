import { SelfPlayRunner } from '../../src/features/ai-worker/training/self-play';

async function main() {
  const runner = new SelfPlayRunner({ depth: 2, storeTranspositions: false });
  const result = await runner.playOneGame();
  console.log(
    JSON.stringify({
      winner: result.winner,
      method: result.method,
      movesPlayed: result.movesPlayed,
      gameTimeMs: Math.round(result.gameTimeMs ?? 0),
      positions: result.positions.length,
    })
  );
}

main().catch((err) => {
  console.error('RUNNER_ERROR=' + String(err));
  process.exit(1);
});
