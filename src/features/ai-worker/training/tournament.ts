// Torneo automático: RED (L10, NN peso 0.6) vs HEURÍSTICA PURA (L6, sin NN).
// Criterio honesto de "master": la red debe ganar >=60% de las partidas.
//
// Usa solo el motor puro (expectimax + AINNModel + rules + INITIAL_BOARD),
// sin import.meta/Supabase, para correr en Node (tsx). Carga pesos desde
// public/model_weights.json (los del re-entrenamiento en curso).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AINNModel } from '../nn-model';
import { evaluatePosition } from '../expectimax';
import { rollDice } from '../../../entities/game/utils';
import { INITIAL_BOARD } from '../../../entities/game/constants';
import {
  getValidMoves, applyMove, getOffIndex,
} from '../../../entities/game/rules';
import type { GameState, PlayerColor, Move } from '../../../entities/game/types';

const WEIGHTS_PATH = process.env.WEIGHTS_PATH
  ? path.resolve(process.env.WEIGHTS_PATH)
  : path.resolve(import.meta.dirname ?? '.', '../../../../public/model_weights.json');

function getWinner(board: number[]): PlayerColor | null {
  const whiteOff = Math.abs(board[getOffIndex('white')] ?? 0);
  const blackOff = Math.abs(board[getOffIndex('black')] ?? 0);
  if (whiteOff >= 15) return 'white';
  if (blackOff >= 15) return 'black';
  return null;
}

const N_GAMES = Number(process.env.N_GAMES ?? 200);
const NN_WIN_TARGET = 0.6;
const RED_COLOR: PlayerColor = 'white';

// --- Cargar pesos entrenados ---
const raw = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
const aiModel = new AINNModel();
await aiModel.ensureModel();
const ok = aiModel.deserializeWeights(raw.weights);
console.log(`[Tournament] weights loaded: ${ok}, trained_count=${raw.trained_count}, layers=${raw.weights.length}`);

const NN_BLEND = Number(process.env.NN_BLEND ?? 0.6);
const HEUR_BLEND = 1 - NN_BLEND;

// --- Evaluadores ---
async function redScore(board: number[], color: PlayerColor): Promise<number> {
  const nn = await aiModel.evaluate(board, color);
  const heur = evaluatePosition(board, color, 2.0);
  return nn * 50 * NN_BLEND + heur * HEUR_BLEND;
}
function heurScore(board: number[], color: PlayerColor): number {
  return evaluatePosition(board, color, 2.0) * 1.0;
}

async function pickBest(
  cands: Move[], simBoard: number[], color: PlayerColor,
  scorer: (b: number[], c: PlayerColor) => Promise<number> | number,
): Promise<Move | null> {
  if (cands.length === 0) return null;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of cands) {
    const nb = applyMove(simBoard, m, color);
    const s = scorer(nb, color);
    const sv = typeof s === 'number' ? s : 0;
    if (sv > bestScore) { bestScore = sv; best = m; }
  }
  return best;
}

async function playGame(): Promise<PlayerColor | null> {
  let board = [...INITIAL_BOARD];
  let turn: PlayerColor = 'white';
  let moves = 0;
  while (moves < 500) {
    const dice = rollDice();
    let available = [...dice];
    let simBoard = [...board];
    let used: number[] = [];
    let pass = 0;
    while (available.length > 0 && pass < 4) {
      const legal = getValidMoves({ board: simBoard, turn, dice, usedDice: used } as GameState);
      const cands = legal.filter(m => available.includes(m.die));
      if (cands.length === 0) { pass++; break; }
      const isRed = (turn === RED_COLOR);
      const m = isRed
        ? await pickBest(cands, simBoard, turn, redScore)
        : await pickBest(cands, simBoard, turn, heurScore);
      if (!m) break;
      simBoard = applyMove(simBoard, m, turn);
      available.splice(available.indexOf(m.die), 1);
      used.push(m.die);
    }
    board = simBoard;
    const winner = getWinner(board);
    if (winner) return winner;
    turn = turn === 'white' ? 'black' : 'white';
    moves++;
  }
  return null;
}

let redWins = 0;
let decisive = 0;
for (let i = 0; i < N_GAMES; i++) {
  const winner = await playGame();
  if (winner === RED_COLOR) redWins++;
  if (winner !== null) decisive++;
  const rate = redWins / (i + 1);
  if ((i + 1) % 25 === 0) {
    console.log(`[Tournament] game ${i + 1}/${N_GAMES} | red wins=${redWins} (${Math.round(rate * 100)}%)`);
  }
}
const finalRate = redWins / N_GAMES;
console.log(`\n[Tournament] FINAL: red win rate = ${Math.round(finalRate * 100)}% of all games (target >= ${Math.round(NN_WIN_TARGET * 100)}%)`);
console.log(`[Tournament] decisive games: ${decisive}/${N_GAMES}`);
console.log(finalRate >= NN_WIN_TARGET ? 'PASS: red supera a heurística pura => LISTO PARA PROBAR' : 'FAIL: red aún no supera umbral');
