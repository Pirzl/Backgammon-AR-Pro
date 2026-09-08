/**
 * Self-play runner (Phase 1 rewrite)
 *
 * Plays REAL backgammon (full turns, not one-die-per-turn) where BOTH sides are
 * the NN itself (with epsilon-greedy exploration), and labels every position
 * with the actual game outcome (±1 for the side to move) — Monte-Carlo return,
 * NOT the expectimax value of the static heuristic.
 *
 * Why: previously the network was a supervised regressor trained to imitate the
 * expectimax value of the same heuristic it must beat in the tournament. You
 * cannot beat a teacher by imitating it. Here the NN plays its own policy and
 * learns to predict its own results, so it can actually improve beyond the
 * heuristic.
 *
 * Convention: a position is recorded at the START of a full turn, from the
 * mover's perspective. `target = +1` iff the mover eventually wins.
 */

import type { PlayerColor } from '../../../entities/game/types';
import { applyMove, getOffIndex, getBarIndex } from '../../../entities/game/rules';
import { INITIAL_BOARD } from '../../../entities/game/constants';
import { aiModel, type TrainingExample } from '../nn-model';
import { evaluatePosition } from '../expectimax';
import { denseTarget } from './dense-target';
import { pickBestFullTurn } from './move-picker';

export type WinMethod = 'normal' | 'gammon' | 'backgammon' | 'none';

export interface SelfPlayResult {
  winner: PlayerColor | null;
  method: WinMethod;
  positions: TrainingExample[];
  movesPlayed: number;
  gameTimeMs: number;
}

export interface SelfPlayConfig {
  /**
   * 'outcome' = ±1 real result; 'td0' = one-step bootstrap (target_i = -V(next),
   * terminal ±1) — much lower variance than pure MC; 'dense' = expectimax (legacy).
   */
  label?: 'outcome' | 'td0' | 'dense';
  /** Expectimax depth when label === 'dense'. */
  denseDepth?: number;
  /**
   * Weight of the NN in move selection. 1.0 = pure NN policy; <1 blends in the
   * static heuristic (score = blend * nnScore + (1-blend) * heuristicScore) so
   * games finish quickly even while the NN is still weak. Labels are still the
   * REAL outcome, so the NN learns the win-probability of the blend policy and
   * the tournament can then use it PURE (greedy w.r.t. that value beats the
   * heuristic once the value is accurate).
   */
  blend?: number;
  /**
   * Who the NN plays against during self-play:
   *  - 'self':      NN vs NN (pure TD-Gammon style). Co-evolves but needs a
   *                 huge number of games to beat a tuned heuristic.
   *  - 'heuristic': NN vs the static heuristic. The value function then learns
   *                 P(win vs THIS opponent) — exactly the tournament scenario —
   *                 so greedy play transfers directly. Much more sample
   *                 efficient for the "beat the heuristic" goal.
   */
  opponent?: 'self' | 'heuristic';
  /** Epsilon-greedy exploration when picking the full-turn sequence. */
  exploration?: number;
  /** Max candidate full-turn sequences scored per roll. */
  maxSequences?: number;
  /** Hard cap on single moves per game (avoid infinite/very long games). */
  maxMoves?: number;
  /** Stop after N games (0 = run forever). */
  maxGames?: number;
}

function rollDice(): number[] {
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  if (d1 === d2) return [d1, d1, d1, d1];
  return [d1, d2];
}

function getWinner(board: number[]): PlayerColor | null {
  if (Math.abs(board[getOffIndex('white')] ?? 0) >= 15) return 'white';
  if (Math.abs(board[getOffIndex('black')] ?? 0) >= 15) return 'black';
  return null;
}

function getWinMethod(board: number[], winner: PlayerColor): WinMethod {
  const loser = winner === 'white' ? 'black' : 'white';
  const loserOff = Math.abs(board[getOffIndex(loser)] ?? 0);
  if (loserOff === 0) {
    const loserBar = Math.abs(board[getBarIndex(loser)] ?? 0);
    const loserHome = countInHome(board, loser);
    if (loserBar > 0 || loserHome < 15) return 'backgammon';
    return 'gammon';
  }
  return 'normal';
}

function countInHome(board: number[], player: PlayerColor): number {
  const [homeStart, homeEnd] = player === 'white' ? [1, 6] : [19, 24];
  const sign = player === 'white' ? 1 : -1;
  let count = 0;
  for (let i = homeStart; i <= homeEnd; i++) {
    const c = board[i] ?? 0;
    if ((sign > 0 && c > 0) || (sign < 0 && c < 0)) count += Math.abs(c);
  }
  return count;
}

export class SelfPlayRunner {
  private running = false;
  private gamesPlayed = 0;
  private gamesRecorded = 0;
  private abortController: AbortController | null = null;
  private config: Required<SelfPlayConfig>;

  constructor(config?: SelfPlayConfig) {
    this.config = {
      label: config?.label ?? 'outcome',
      denseDepth: config?.denseDepth ?? 0,
      blend: config?.blend ?? 1.0,
      opponent: config?.opponent ?? 'self',
      exploration: config?.exploration ?? 0.2,
      maxSequences: config?.maxSequences ?? 96,
      maxMoves: config?.maxMoves ?? 300,
      maxGames: config?.maxGames ?? 0,
    };
  }

  get isRunning(): boolean { return this.running; }
  get totalGames(): number { return this.gamesPlayed; }
  get recordedGames(): number { return this.gamesRecorded; }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
  }

  async playOneGame(): Promise<SelfPlayResult> {
    const previousRunning = this.running;
    this.running = true;
    const startTime = performance.now();
    try {
      let board = [...INITIAL_BOARD];
      let turn: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
      // In 'heuristic' mode the NN owns one color; the other color is the
      // fixed heuristic opponent (the exact tournament matchup).
      const nnColor: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
      const recorded: { board: number[]; turn: PlayerColor }[] = [];
      const seenPositions = new Set<string>();
      let movesPlayed = 0;
      const maxMoves = this.config.maxMoves;

      while (this.running && movesPlayed < maxMoves) {
        if (getWinner(board) !== null) break;

        recorded.push({ board: [...board], turn });

        // Cycle breaker: a weak NN policy can fall into a deterministic loop
        // (same board + side to move). Forcing a random move breaks it; the
        // game then finishes instead of spinning until the move cap.
        const posKey = `${turn}:${board.join(',')}`;
        const isRepeat = seenPositions.has(posKey);
        seenPositions.add(posKey);

        const dice = rollDice();
        const isNNTurn = this.config.opponent === 'self' || turn === nnColor;
        const evaluator = async (afters: number[][], mover: PlayerColor, opp: PlayerColor) => {
          const out: number[] = new Array(afters.length);
          if (!isNNTurn) {
            for (let i = 0; i < afters.length; i++) out[i] = evaluatePosition(afters[i]!, mover, 2.0);
            return out;
          }
          const nn = await aiModel.evaluateBatch(afters, afters.map(() => opp));
          for (let i = 0; i < afters.length; i++) out[i] = -nn[i]! * 50;
          return out;
        };

        const { sequence } = await pickBestFullTurn(board, dice, turn, evaluator, {
          maxSequences: this.config.maxSequences,
          epsilon: isRepeat ? 1 : (isNNTurn ? this.config.exploration : 0),
        });

        if (sequence.length > 0) {
          for (const move of sequence) {
            board = applyMove(board, move, turn);
            movesPlayed++;
          }
        }
        turn = turn === 'white' ? 'black' : 'white';
      }

      const winner = getWinner(board);
      const method: WinMethod = winner ? getWinMethod(board, winner) : 'none';

      const examples: TrainingExample[] = [];
      if (winner) {
        if (this.config.label === 'td0') {
          // One-step TD bootstrap: target_i = -V(board_{i+1}, opponent) because
          // after a full turn the next mover is the opponent and V is "P(mover
          // wins)" in [-1,1] (so P(mover_i wins) = 1 - P(mover_{i+1} wins) maps
          // to -V in net units). The last recorded position is terminal-anchored
          // (±1). Bootstrapping cuts label variance vs raw outcome labels.
          const nextBoards = recorded.slice(1).map(r => r.board);
          const nextTurns = recorded.slice(1).map(r => r.turn);
          const preds = nextBoards.length > 0
            ? await aiModel.evaluateBatch(nextBoards, nextTurns)
            : new Float32Array(0);
          for (let i = 0; i < recorded.length; i++) {
            const playerWon = recorded[i]!.turn === winner;
            const target = i === recorded.length - 1
              ? (playerWon ? 1 : -1)
              : -preds[i]!;
            examples.push({
              board: recorded[i]!.board,
              turn: recorded[i]!.turn,
              target: Math.max(-1, Math.min(1, target)),
            });
          }
        } else if (this.config.label === 'dense') {
          for (const rec of recorded) {
            const target = await denseTarget(rec.board, rec.turn, this.config.denseDepth);
            examples.push({ board: rec.board, turn: rec.turn, target });
          }
        } else {
          for (const rec of recorded) {
            const playerWon = rec.turn === winner;
            examples.push({ board: rec.board, turn: rec.turn, target: playerWon ? 1 : -1 });
          }
        }
      }

      return { winner, method, positions: examples, movesPlayed, gameTimeMs: performance.now() - startTime };
    } finally {
      if (!previousRunning) {
        this.running = false;
      }
    }
  }

  /**
   * Plays games and reports each via onGameComplete. Training is the caller's
   * job (it may want a replay buffer instead of per-game fits).
   *
   * The callback is AWAITED: tfjs `LayersModel.fit` is single-flight, so a
   * training call must fully complete before the next game starts. Otherwise
   * overlapping fits throw "another fit() call is ongoing".
   */
  async runForever(onGameComplete?: (result: SelfPlayResult) => void | Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();

    await aiModel.ensureModel();

    while (this.running && (this.config.maxGames <= 0 || this.gamesPlayed < this.config.maxGames)) {
      try {
        const result = await this.playOneGame();
        this.gamesPlayed++;
        await onGameComplete?.(result);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') break;
        console.warn('[SelfPlay] Game error:', err);
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
}

export const selfPlayRunner = new SelfPlayRunner();
