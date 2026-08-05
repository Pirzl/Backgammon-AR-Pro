/**
 * Self-Play Training Script
 * Runs AI vs AI games using expectimax + NN, trains via TD learning,
 * and persists model weights to Supabase + local file + public/ (static asset).
 *
 * Usage: tsx scripts/train-selfplay.ts [--games=100] [--save-every=10]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as tf from '@tensorflow/tfjs';

// ── 1. Load .env ─────────────────────────────────────────────────────────────
function loadEnv(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const envFile = path.resolve(import.meta.dirname, '..', '.env');
const envVars = loadEnv(envFile);
const SUPABASE_URL = envVars.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = envVars.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Check .env file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TOTAL_GAMES = parseInt(args.find(a => a.startsWith('--games='))?.split('=')[1] ?? '200', 10);
const SAVE_EVERY = parseInt(args.find(a => a.startsWith('--save-every='))?.split('=')[1] ?? '10', 10);
const GAMES_PER_BATCH = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '5', 10);

// ── 3. Import game modules (pure TS, works in Node) ─────────────────────────
import type { GameState, PlayerColor, Move } from '../src/entities/game/types';
import { applyMove, getOffIndex, getBarIndex, getValidMoves, getAvailableDice, allCheckersHome, getHomeBoard, getDirection } from '../src/entities/game/rules';
import { INITIAL_BOARD } from '../src/entities/game/constants';
import { generateAllTurnSequences } from '../src/entities/game/full-turn-generator';
import { getBestSequence, setNNEvaluator } from '../src/features/ai-worker/expectimax';
import { AINNModel } from '../src/features/ai-worker/nn-model';

// ── 4. NN Model ──────────────────────────────────────────────────────────────
const model = new AINNModel();
await model.ensureModel();

interface CheckpointData {
  id: string;
  weights: { shape: number[]; data: number[] }[];
  trained_count: number;
  total_updates: number;
  games_played: number;
  updated_at: string;
}

const WEIGHTS_FILE = path.resolve(import.meta.dirname, 'model_weights.json');
const PUBLIC_WEIGHTS_FILE = path.resolve(import.meta.dirname, '..', 'public', 'model_weights.json');
const PUBLIC_WISDOM_FILE = path.resolve(import.meta.dirname, '..', 'public', 'ai-wisdom.json');
const WISDOM_MAX_ENTRIES = 12000;

function readLocalWeights(): CheckpointData | null {
  try {
    if (fs.existsSync(WEIGHTS_FILE)) {
      return JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function writeLocalWeights(cp: Omit<CheckpointData, 'id' | 'updated_at'>): void {
  try {
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify({ ...cp, id: 'current', updated_at: new Date().toISOString() }, null, 2));
  } catch (e) {
    console.warn('[Save] Local file write failed:', e);
  }
}

function readLocalWisdomAsset(): Record<string, { equity: number; best_move: { from: number; to: number; die: number } | null; depth: number }> {
  try {
    if (fs.existsSync(PUBLIC_WISDOM_FILE)) {
      const raw = fs.readFileSync(PUBLIC_WISDOM_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function shaLikeKey(board: number[]): string {
  // Use a compact stable identifier; exact Zobrist not required for offline asset here.
  return board.map((v) => `${v}`).join('|');
}

function upsertWisdomAsset(positions: { board: number[]; turn: PlayerColor; target: number }[]): void {
  const current = readLocalWisdomAsset();
  const keys = Object.keys(current);
  const budget = Math.max(0, WISDOM_MAX_ENTRIES - keys.length);
  if (budget <= 0) return;

  const added: Record<string, { equity: number; best_move: { from: number; to: number; die: number } | null; depth: number }> = {};
  let inserted = 0;
  for (const pos of positions) {
    if (inserted >= budget) break;
    const key = shaLikeKey(pos.board);
    if (!current[key]) {
      added[key] = {
        equity: Math.max(-1, Math.min(1, pos.target === 1 ? 0.6 : -0.6)),
        best_move: null,
        depth: 1,
      };
      inserted++;
    }
  }

  if (inserted > 0) {
    const merged = { ...current, ...added };
    try {
      fs.writeFileSync(PUBLIC_WISDOM_FILE, JSON.stringify(merged, null, 2));
      console.log(`[WisdomAsset] Wrote ${inserted} new entries. Total: ${Object.keys(merged).length}`);
    } catch (e) {
      console.warn('[WisdomAsset] Write failed:', e);
    }
  }
}

// Try loading saved weights from Supabase or local file
async function loadCheckpoint(): Promise<number> {
  let cp: CheckpointData | null = null;

  // Try Supabase first
  try {
    const { data } = await supabase
      .from('model_weights')
      .select('*')
      .eq('id', 'current')
      .maybeSingle();
    if (data) cp = data as unknown as CheckpointData;
  } catch { /* fallback to file */ }

  // Fallback to local file
  if (!cp) cp = readLocalWeights();

  if (cp?.weights?.length > 0) {
    const ok = model.deserializeWeights(cp.weights);
    if (ok) {
      model.setTrainedCount(cp.trained_count ?? 0);
      console.log(`[Checkpoint] Loaded weights (${cp.trained_count ?? 0} positions, ${cp.games_played ?? 0} games)`);
      return cp.games_played ?? 0;
    }
  }
  console.log('[Checkpoint] No saved weights found, starting fresh');
  return 0;
}

async function saveCheckpoint(gamesPlayed: number): Promise<void> {
  const weightData = model.serializeWeights();
  if (weightData.length === 0) return;

  const payload = {
    weights: weightData,
    trained_count: model.getTrainedCount(),
    total_updates: model.getTotalWeightUpdates(),
    games_played: gamesPlayed,
  };

  // Try Supabase
  try {
    const { error } = await supabase
      .from('model_weights')
      .upsert({ id: 'current', ...payload, updated_at: new Date().toISOString() });
    if (!error) {
      console.log(`[Save] Saved checkpoint to Supabase at game ${gamesPlayed}`);
      return;
    }
  } catch { /* fallback */ }

  // Fallback to local file (scripts/ directory)
  writeLocalWeights(payload);

  // Also copy to public/ so Vite serves it for browser workers
  try {
    const fullPayload = { id: 'current', ...payload, updated_at: new Date().toISOString() };
    fs.writeFileSync(PUBLIC_WEIGHTS_FILE, JSON.stringify(fullPayload, null, 2));
  } catch (e) {
    console.warn('[Save] Public file write failed:', e);
  }

  console.log(`[Save] Saved checkpoint to file at game ${gamesPlayed}`);
}

// Register NN evaluator into expectimax (threshold: only after 100+ positions)
setNNEvaluator(async (board, player) => {
  if (model.getTrainedCount() < 100) return null;
  return await model.evaluate(board, player);
});

// ── 5. Game helpers ──────────────────────────────────────────────────────────
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

function getWinMethod(board: number[], winner: PlayerColor): string {
  const loser = winner === 'white' ? 'black' : 'white';
  const loserOff = Math.abs(board[getOffIndex(loser)] ?? 0);
  if (loserOff === 0) {
    const loserBar = Math.abs(board[getBarIndex(loser)] ?? 0);
    if (loserBar > 0) return 'backgammon';
    return 'gammon';
  }
  return 'normal';
}

// ── 6. Play one self-play game ───────────────────────────────────────────────
interface GameResult {
  winner: PlayerColor;
  method: string;
  movesPlayed: number;
  positions: { board: number[]; turn: PlayerColor; target: number }[];
  durationMs: number;
}

async function playGame(config: { depth: number; oppCap: number }): Promise<GameResult> {
  const start = performance.now();
  let board = [...INITIAL_BOARD];
  let turn: PlayerColor = Math.random() < 0.5 ? 'white' : 'black';
  const positions: { board: number[]; turn: PlayerColor }[] = [];
  let movesPlayed = 0;
  const gameState: GameState = {
    board, turn, dice: [], usedDice: [],
    cube: 1, cubeOwner: null, crawford: false,
    matchScore: { white: 0, black: 0 }, winner: null,
  };

  while (movesPlayed < 500) {
    if (getWinner(board)) break;

    const dice = rollDice();
    gameState.board = board;
    gameState.turn = turn;
    gameState.dice = dice;
    gameState.usedDice = [];

    positions.push({ board: [...board], turn });

    const result = await getBestSequence(gameState, config.depth, config.oppCap);

    if (result.sequence.length > 0) {
      for (const move of result.sequence) {
        board = applyMove(board, move, turn);
        movesPlayed++;
      }
    }

    turn = turn === 'white' ? 'black' : 'white';

    // Yield every few moves to avoid blocking event loop
    if (movesPlayed % 8 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const winner = getWinner(board) ?? (turn === 'white' ? 'black' : 'white');
  const method = getWinMethod(board, winner);

  const examples = positions.map(p => ({
    ...p,
    target: p.turn === winner ? 1 : -1,
  }));

  return { winner, method, movesPlayed, positions: examples, durationMs: performance.now() - start };
}

// ── 7. Training loop ─────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════');
console.log('  Backgammon Self-Play Training');
console.log(`  Games: ${TOTAL_GAMES}  |  Save every: ${SAVE_EVERY}  |  Batch: ${GAMES_PER_BATCH}`);
console.log(`  NN: 198→40→1, LR=0.005, depth=2, oppCap=45`);
console.log('══════════════════════════════════════════════');

const existingGames = await loadCheckpoint();
let totalGames = existingGames;
let totalPositions = model.getTrainedCount();
let totalBatches = 0;
const startTime = Date.now();

for (let game = 1; game <= TOTAL_GAMES; game++) {
  totalGames++;

  const result = await playGame({ depth: 2, oppCap: 45 });

  if (result.positions.length > 0) {
    await model.trainOnGame(result.positions);
    totalPositions = model.getTrainedCount();

    // Local wisdom asset for offline build packaging
    try { upsertWisdomAsset(result.positions); } catch { /* non-critical */ }
  }

  if (game % GAMES_PER_BATCH === 0) {
    totalBatches++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgGameMs = (result.durationMs).toFixed(0);
    console.log(
      `[${game}/${TOTAL_GAMES}] ${result.winner.padEnd(5)} ${result.method.padEnd(10)} ` +
      `${result.movesPlayed}m ${avgGameMs}ms | ` +
      `Positions: ${totalPositions} | Elapsed: ${elapsed}s`
    );
  }

  // Save checkpoint
  if (game % SAVE_EVERY === 0) {
    await saveCheckpoint(totalGames);
    // Log batch result to game_logs table (optional feedback)
    try {
      await supabase.from('game_logs').insert({
        winner: result.winner,
        winner_color: result.winner,
        loser_color: result.winner === 'white' ? 'black' : 'white',
        win_method: result.method,
        score_delta: 1,
        move_chosen: {},
        board_hash: `${Date.now()}`,
        played_at: new Date().toISOString(),
        white_player_id: null,
        black_player_id: null,
      });
    } catch { /* non-critical */ }
  }

  // GC hint every batch
  if (game % GAMES_PER_BATCH === 0) {
    if (global.gc) global.gc();
  }
}

// Final save
await saveCheckpoint(totalGames);
const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('══════════════════════════════════════════════');
console.log(`  Training complete!`);
console.log(`  Games: ${totalGames}`);
console.log(`  Positions trained: ${totalPositions}`);
console.log(`  Time: ${totalElapsed}s`);
console.log(`  Avg: ${(TOTAL_GAMES / (parseInt(totalElapsed) || 1)).toFixed(1)} games/s`);
console.log('══════════════════════════════════════════════');

// Cleanup
model.dispose();
process.exit(0);
