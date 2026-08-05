import { SelfPlayRunner } from '../../src/features/ai-worker/training/self-play';

async function main() {
  const rounds = Number(process.argv[2] ?? '4');
  const whiteDepth = Math.max(1, Number(process.argv[3] ?? '5'));
  const blackDepth = Math.max(1, Number(process.argv[4] ?? '10'));
  
  let blackWins = 0;
  let whiteWins = 0;
  let totalMoves = 0;
  let totalMs = 0;

  for (let r = 0; r < rounds; r++) {
    const runner = new SelfPlayRunner({ depth: Math.max(whiteDepth, blackDepth), whiteDepth, blackDepth, storeTranspositions: false });
    const game = await runner.playOneGame();
    
    if (game.winner === 'black') blackWins++;
    else whiteWins++;
    totalMoves += game.movesPlayed ?? 0;
    totalMs += game.gameTimeMs ?? 0;

    console.log(JSON.stringify({ event: 'game', round: r + 1, winner: game.winner, method: game.method, movesPlayed: game.movesPlayed, gameTimeMs: Math.round(game.gameTimeMs ?? 0) }));
  }

  console.log(JSON.stringify({ event: 'summary', rounds, blackWins, whiteWins, avgMoves: Math.round(totalMoves / rounds), avgMs: Math.round(totalMs / rounds) }));
}

main().catch(err => { console.error(err); process.exit(1); });
