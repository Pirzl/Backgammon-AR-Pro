// Torneo automático: RED (NN) vs HEURÍSTICA PURA (sin NN).
// Criterio honesto de "master": la red debe ganar >=60% de las partidas.
//
// Usa solo el motor puro (expectimax + AINNModel + rules + INITIAL_BOARD),
// sin import.meta/Supabase, para correr en Node (tsx). Carga pesos desde
// public/model_weights.json (los del re-entrenamiento en curso).
//
// Phase 1 changes:
//  - Both sides play FULL turns via pickBestFullTurn (real backgammon).
//  - Red defaults to PURE NN (NN_BLEND=1.0); the blend measurement stays
//    available via --nn-blend for the browser-difficulty analogue.
//  - The NN is scored from the MOVER's perspective: -V(boardAfter, opponent),
//    consistent with how the network is now trained (side-to-move convention).
//  - The first player and RED's color are randomized every game, removing the
//    white-first bias that inflated/deflated winrate in earlier runs.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AINNModel } from '../nn-model';
import { evaluatePosition } from '../expectimax';
import { rollDice } from '../../../entities/game/utils';
import { INITIAL_BOARD } from '../../../entities/game/constants';
import { applyMove, getOffIndex } from '../../../entities/game/rules';
import type { PlayerColor } from '../../../entities/game/types';
import { pickBestFullTurn } from './move-picker';

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

export interface TournamentResult {
  redWins: number;
  decisive: number;
  games: number;
  /** redWins / decisive games (the honest rate; 0 when no decisive games). */
  rate: number;
  /** redWins / total games (includes draws). */
  rateAll: number;
}

/**
 * Run a head-to-head: RED (NN, blend-able) vs HEURISTIC (pure).
 *
 * @param opts.games  number of games (default 200)
 * @param opts.blend  NN weight in red's score (default 1.0 = pure NN)
 * @param opts.nn     reuse an already-trained AINNModel (skips file reload)
 * @param opts.maxSequences  candidate full-turn sequences scored per roll
 */
export async function runTournament(
  opts: { games?: number; blend?: number; nn?: AINNModel; maxSequences?: number } = {},
): Promise<TournamentResult> {
  const N_GAMES = opts.games ?? 200;
  const NN_BLEND = opts.blend ?? 1.0;
  const HEUR_BLEND = 1 - NN_BLEND;
  const maxSequences = opts.maxSequences ?? 96;

  const aiModel = opts.nn ?? new AINNModel();
  await aiModel.ensureModel();
  if (!opts.nn) {
    const raw = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
    const ok = aiModel.deserializeWeights(raw.weights);
    console.log(`[Tournament] weights loaded: ${ok}, trained_count=${raw.trained_count}, layers=${raw.weights.length}`);
  }

  async function scoreRed(afters: number[][], mover: PlayerColor, opp: PlayerColor): Promise<number[]> {
    const nn = await aiModel.evaluateBatch(afters, afters.map(() => opp));
    const out: number[] = new Array(afters.length);
    for (let i = 0; i < afters.length; i++) {
      out[i] = (-nn[i]! * 50 * NN_BLEND) + (evaluatePosition(afters[i]!, mover, 2.0) * HEUR_BLEND);
    }
    return out;
  }

  async function scoreHeur(afters: number[][], mover: PlayerColor): Promise<number[]> {
    const out: number[] = new Array(afters.length);
    for (let i = 0; i < afters.length; i++) {
      out[i] = evaluatePosition(afters[i]!, mover, 2.0);
    }
    return out;
  }

  async function playGame(redColor: PlayerColor): Promise<PlayerColor | null> {
    let board = [...INITIAL_BOARD];
    let turn: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
    let moves = 0;
    while (moves < 500) {
      const winner = getWinner(board);
      if (winner) return winner;

      const dice = rollDice();
      const isRed = turn === redColor;
      const evaluator = isRed ? scoreRed : (afters: number[][], mover: PlayerColor, _opp: PlayerColor) => scoreHeur(afters, mover);
      const { sequence } = await pickBestFullTurn(board, dice, turn, evaluator, { maxSequences, epsilon: 0 });

      if (sequence.length > 0) {
        for (const m of sequence) {
          board = applyMove(board, m, turn);
        }
      }
      moves++;
      turn = turn === 'white' ? 'black' : 'white';
    }
    return null;
  }

  let redWins = 0;
  let decisive = 0;
  for (let i = 0; i < N_GAMES; i++) {
    const redColor: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
    const winner = await playGame(redColor);
    if (winner === redColor) redWins++;
    if (winner !== null) decisive++;
    if ((i + 1) % 25 === 0) {
      const rate = decisive > 0 ? redWins / decisive : 0;
      console.log(`[Tournament] game ${i + 1}/${N_GAMES} | red wins=${redWins}/${decisive} decisive (${Math.round(rate * 100)}%)`);
    }
  }
  const rate = decisive > 0 ? redWins / decisive : 0;
  const rateAll = redWins / N_GAMES;
  console.log(`\n[Tournament] FINAL: red win rate = ${Math.round(rate * 100)}% (decisive ${decisive}/${N_GAMES}), all=${Math.round(rateAll * 100)}% (target >= 60%)`);
  return { redWins, decisive, games: N_GAMES, rate, rateAll };
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const N_GAMES = Number(process.env.N_GAMES ?? 200);
  const NN_BLEND = Number(process.env.NN_BLEND ?? 1.0);
  runTournament({ games: N_GAMES, blend: NN_BLEND }).then(res => {
    console.log(res.rate >= 0.6 ? 'PASS: red supera a heurística pura => LISTO PARA PROBAR' : 'FAIL: red aún no supera umbral');
    process.exit(0);
  });
}
