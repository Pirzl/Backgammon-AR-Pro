import { SelfPlayRunner } from './self-play';

const runner = new SelfPlayRunner({ depth: 2, oppCap: 45, storeTranspositions: false, whiteDepth: 2, blackDepth: 2 });
runner.runForever((game) => {
  console.log(JSON.stringify({
    winner: game.winner,
    method: game.method,
    movesPlayed: game.movesPlayed,
    gameTimeMs: Math.round(game.gameTimeMs ?? 0),
    positions: game.positions.length,
  }));
});
