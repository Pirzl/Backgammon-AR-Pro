import type { GameState, PlayerColor } from '../../../entities/game/types';
import { applyMove, getOffIndex, getBarIndex, getValidMoves } from '../../../entities/game/rules';
import { INITIAL_BOARD } from '../../../entities/game/constants';
import { getBestMove } from '../expectimax';
import { aiModel, type TrainingExample } from '../nn-model';
import { denseTarget } from './dense-target';
import type { Evaluation } from '../api';

export interface SelfPlayResult {
  winner: PlayerColor;
  method: 'normal' | 'gammon' | 'backgammon';
  positions: TrainingExample[];
  movesPlayed: number;
  gameTimeMs: number;
}

export interface SelfPlayConfig {
  depth?: number;
  oppCap?: number;
  storeTranspositions?: boolean;
  whiteDepth?: number;
  blackDepth?: number;
  /** (C) Label positions with the expectimax value instead of ±1 (default true). */
  denseTargets?: boolean;
  /** Expectimax depth for dense labels; 0 = static heuristic (fast). */
  denseDepth?: number;
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

function getWinMethod(board: number[], winner: PlayerColor): 'normal' | 'gammon' | 'backgammon' {
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
      depth: config?.depth ?? 2,
      oppCap: config?.oppCap ?? 45,
      storeTranspositions: config?.storeTranspositions ?? true,
      whiteDepth: config?.whiteDepth ?? config?.depth ?? 2,
      blackDepth: config?.blackDepth ?? config?.depth ?? 2,
      denseTargets: config?.denseTargets ?? true,
      denseDepth: config?.denseDepth ?? 0,
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
    console.log('[SelfPlay] playOneGame_start');
    try {
      const startTime = performance.now();
      let board = [...INITIAL_BOARD];
      let turn: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
      const positions: { board: number[]; turn: PlayerColor }[] = [];
      let movesPlayed = 0;

      while (this.running) {
        if (getWinner(board) !== null) {
          console.log('[SelfPlay] winner_exit');
          break;
        }
        if (movesPlayed > 500) {
          console.log('[SelfPlay] movecap_exit', { movesPlayed });
          break;
        }

        const dice = rollDice();

        if (getValidMoves({
          board,
          turn,
          dice,
          usedDice: [],
          cube: 1,
          cubeOwner: null,
          crawford: false,
          matchScore: { white: 0, black: 0 },
          winner: null,
        }).length === 0) {
          console.log('[SelfPlay] turn=' + turn + ' dice=' + JSON.stringify(dice) + ' validMoves=0 pass');
          turn = turn === 'white' ? 'black' : 'white';
          continue;
        }

        const gameState: GameState = {
          board,
          turn,
          dice,
          usedDice: [],
          cube: 1,
          cubeOwner: null,
          crawford: false,
          matchScore: { white: 0, black: 0 },
          winner: null,
        };

        const depth = turn === 'white' ? this.config.whiteDepth : this.config.blackDepth;
        const startBest = performance.now();
        const result = await getBestMove(gameState, depth);
        const bestMs = Math.round(performance.now() - startBest);
        const sequence = result.move ? [result.move] : [];

        console.log('[SelfPlay] turn=' + turn + ' depth=' + depth + ' bestMs=' + bestMs + ' seq=' + sequence.length + ' value=' + (result.value ?? 0));

        if (sequence.length > 0) {
          for (const move of sequence) {
            board = applyMove(board, move, turn);
            movesPlayed++;
            positions.push({ board: [...board], turn: turn === 'white' ? 'black' : 'white' });
          }
          turn = turn === 'white' ? 'black' : 'white';
        } else {
          turn = turn === 'white' ? 'black' : 'white';
        }
      }

      const winner = getWinner(board) ?? (turn === 'white' ? 'black' : 'white');
      const method = getWinMethod(board, winner);
      const gameTimeMs = performance.now() - startTime;

      const examples: TrainingExample[] = [];
      for (const pos of positions) {
        const playerWon = pos.turn === winner;
        let target: number;
        if (this.config.denseTargets) {
          target = await denseTarget(pos.board, pos.turn, this.config.denseDepth);
        } else {
          target = playerWon ? 1 : -1;
        }
        examples.push({
          board: pos.board,
          turn: pos.turn,
          target,
        });
      }

      return { winner, method, positions: examples, movesPlayed, gameTimeMs };
    } finally {
      if (!previousRunning) {
        this.running = false;
      }
    }
  }

  async runForever(onGameComplete?: (result: SelfPlayResult) => void): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();

    await aiModel.ensureModel();

    while (this.running) {
      try {
        const result = await this.playOneGame();
        this.gamesPlayed++;

        if (result.positions.length > 0) {
          await aiModel.trainOnGame(result.positions);
          this.gamesRecorded++;

          if (this.config.storeTranspositions && result.positions.length > 0) {
            this.storeTranspositions(result).catch(() => {});
          }
        }

        onGameComplete?.(result);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') break;
        console.warn('[SelfPlay] Game error:', err);
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  private async storeTranspositions(result: SelfPlayResult): Promise<void> {
    const hashFn = (await import('../zobrist')).hashBoard;
    const updates = new Map<bigint, Omit<Evaluation, 'id' | 'created_at'>>();

    for (const ex of result.positions) {
      const hash = hashFn(ex.board);
      const turnSign = ex.turn === result.winner ? 1 : -1;
      const depth = this.config.depth;

      if (!updates.has(hash)) {
        updates.set(hash, {
          equity: Math.max(-100, Math.min(100, turnSign * 50)),
          best_move: null,
          depth,
        });
      }
    }

    if (updates.size > 0) {
      try {
        await import('../api').then(m => m.batchStore(updates));
      } catch {
        // Non-critical; transposition storage is best-effort
      }
    }
  }
}

export const selfPlayRunner = new SelfPlayRunner();
