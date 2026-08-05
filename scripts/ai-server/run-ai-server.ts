// Standalone AI server for VIVO.
// Run: npx tsx scripts/ai-server/run-ai-server.ts

import http from 'http';
import { getValidMoves, applyMove, isValidMove } from '../../src/entities/game/rules';
import { evaluatePosition, expectimaxChance } from '../../src/features/ai-worker/expectimax';
import { generateAllTurnSequences } from '../../src/entities/game/full-turn-generator';
import type { GameState } from '../../src/entities/game/types';

const PORT = Number(process.env.VITE_AI_SERVER_PORT ?? '5125');

const requestListener = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/ai-move') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as Record<string, unknown>;

      const board = body.board;
      const dice = body.dice;
      const difficulty = body.difficulty;
      const turn = body.turn;
      const usedDice = Array.isArray(body.usedDice) ? body.usedDice : [];

      if (
        !Array.isArray(board) ||
        !Array.isArray(dice) ||
        typeof difficulty !== 'number' ||
        typeof turn !== 'string'
      ) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad request' }));
        return;
      }

      const aiColor = turn === 'white' ? 'white' : 'black';
      const difficultyClamped = Math.max(1, Math.min(10, Math.round(difficulty)));

      if (!dice.length) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ moves: [] }));
        return;
      }

      const moves = await chooseAiMoves(board, dice, aiColor, difficultyClamped, turn, usedDice);

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ moves }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  } catch (err) {
    console.error('[ai-move] failed:', err);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'internal error' }));
  }
};

async function chooseAiMoves(
  board: number[],
  dice: number[],
  aiColor: 'white' | 'black',
  difficulty: number,
  turn: string,
  usedDice: unknown[]
) {
  if (difficulty >= 8) {
    const gameState = {
      board,
      turn: aiColor,
      usedDice,
    } as GameState;

    const allSequences = generateAllTurnSequences(board, dice, aiColor, usedDice as number[]);

    if (!allSequences.length) return [];
    if (allSequences.length === 1) return allSequences[0];

    const MAX_SEQUENCES = 500;
    const presorted = allSequences
      .map((seq) => {
        let simBoard = board.slice();
        for (const m of seq) simBoard = applyMove(simBoard, m, aiColor);
        return { seq, quickScore: evaluatePosition(simBoard, aiColor) };
      })
      .sort((a, b) => b.quickScore - a.quickScore);

    const turnSequences = presorted.slice(0, MAX_SEQUENCES).map((row) => row.seq);

    let bestSequence = turnSequences[0];
    let bestScore = -Infinity;

    for (const seq of turnSequences) {
      let simBoard = board.slice();
      for (const m of seq) simBoard = applyMove(simBoard, m, aiColor);

      let score = evaluatePosition(simBoard, aiColor);

      if (difficulty >= 9) {
        const oppColor = aiColor === 'white' ? 'black' : 'white';
        const oppState: GameState = { ...gameState, board: simBoard, turn: oppColor, dice: [], usedDice: [] };
        const expDepth = difficulty === 10 ? 2 : 1;
        const expScore = await expectimaxChance(oppState, expDepth, aiColor);
        score = score * 0.65 + expScore * 0.35;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSequence = seq;
      }
    }

    return bestSequence ?? [];
  }

  const finalMoves: { from: number; to: number; die: number }[] = [];
  const availableDice = dice.slice();
  let simBoard = board.slice();

  while (availableDice.length > 0) {
    const simUsedDice = [...(usedDice as number[]), ...finalMoves.map((m) => m.die)];
    const simState = { board: simBoard, turn: aiColor, usedDice: simUsedDice } as GameState;
    const legalMoves = getValidMoves(simState);
    if (!legalMoves.length) break;

    const candidates = legalMoves.filter((m) => availableDice.includes(m.die));
    if (!candidates.length) break;

    const useNoise = difficulty <= 3;
    const picked =
      useNoise && (Math.random() < 0.35 || difficulty <= 2)
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : candidates
            .slice()
            .sort(
              (a, b) =>
                evaluatePosition(applyMove(simBoard, b, aiColor), aiColor) -
                evaluatePosition(applyMove(simBoard, a, aiColor), aiColor)
            )[0];

    if (!picked) break;

    availableDice.splice(availableDice.indexOf(picked.die), 1);
    finalMoves.push(picked);
    simBoard = applyMove(simBoard, picked, aiColor);
  }

  return finalMoves;
}

http.createServer(requestListener).listen(PORT, () => {
  console.log(`[ai-move] listening on :${PORT}`);
});
