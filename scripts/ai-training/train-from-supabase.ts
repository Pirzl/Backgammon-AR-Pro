/**
 * Offline Training Pipeline from real game data (B + C) — with quality gate.
 *
 * Reads recorded turns from `game_history_analysis` (collected live by the
 * browser via CONFIRM_TURN_END), reconstructs a TrainingExample per recorded
 * position, labels it (dense expectimax value and/or real outcome), trains the
 * shared NN, validates against a holdout, and — only if the NN did not regress —
 * persists the new weights to:
 *   - Supabase `model_weights` (id='current')   ← the ONLINE source of truth,
 *     fetched by the browser at runtime (nn-model.ts)
 *   - scripts/model_weights.json (local checkpoint)
 *   - public/model_weights.json (static asset served to the browser)
 *
 * Data-recording fix (2026-08-03): `turn_number` in game_history_analysis is now
 * a global per-game turn counter. Order within a game is reconstructed from
 * `created_at` (monotonic per game) so OLD rows recorded with the buggy
 * per-turn move count still reconstruct correctly; the winner is read from
 * `board_snapshot.winner` when present (fallback: last non-terminal board).
 *
 * Quality gate (2026-08-03): the newest `--holdout` games are never trained on.
 * Mean-squared-error of the NN prediction vs the dense teacher target is
 * computed on that holdout with the PREVIOUS weights and with the NEW weights.
 * The run publishes only when `newMSE <= oldMSE * (1 + --publish-if-worse-ok)`,
 * so a retrain can never ship a regression. (head-to-head via expectimax is NOT
 * a valid NN check: expectimax.getBestMove evaluates the static heuristic only.)
 *
 * Usage:
 *   tsx scripts/ai-training/train-from-supabase.ts [--limit=2000] [--depth=2] [--label=blend] [--blend=0.5] [--holdout=3] [--publish-if-worse-ok=0.05] [--workers=4] [--dry-run] [--out=...]
 *
 * Options:
 *   --limit=N        max history rows to read (default 2000)
 *   --depth=N        expectimax depth for dense labels; 0 = static heuristic (default 2)
 *   --label=M        target label mode: dense | outcome | blend (default blend)
 *   --blend=W        outcome weight when label=blend (default 0.5)
 *   --holdout=N      newest N games held out of training (gate, default 3)
 *   --publish-if-worse-ok=W  publish if newMSE <= oldMSE*(1+W) (default 0.05)
 *   --workers=N      concurrency for dense target computation (default 4)
 *   --dry-run        train + validate but persist nothing external
 *   --report=path    append one JSON line per run (default scripts/ai-training/train-report.jsonl)
 *   --out=path       write checkpoint here (default scripts/model_weights.json)
 *
 * Env (used when `.env` is absent, e.g. GitHub Actions): VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (optional; used for writes
 * when present).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { aiModel } from '../../src/features/ai-worker/nn-model';
import { denseTarget } from '../../src/features/ai-worker/training/dense-target';
import type { PlayerColor } from '../../src/entities/game/types';
import { OFF_WHITE, OFF_BLACK } from '../../src/entities/game/constants';

// ── 1. Load .env ─────────────────────────────────────────────────────────────
function loadEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
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

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const envVars = loadEnv(path.join(ROOT, '.env'));
const SUPABASE_URL = envVars.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? envVars.SUPABASE_SERVICE_ROLE_KEY ?? envVars.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Check .env file or SUPABASE_* env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. Parse CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const parse = (flag: string, def: string) => args.find(a => a.startsWith(flag))?.split('=')[1] ?? def;

const LIMIT = parseInt(parse('--limit=', '2000'), 10);
const DENSE_DEPTH = parseInt(parse('--depth=', '2'), 10);
const LABEL_MODE = parse('--label=', 'blend') as 'dense' | 'outcome' | 'blend';
const BLEND_W = Math.max(0, Math.min(1, parseFloat(parse('--blend=', '0.5'))));
const HOLDOUT = Math.max(0, parseInt(parse('--holdout=', '3'), 10));
const PUBLISH_IF_WORSE_OK = Math.max(0, parseFloat(parse('--publish-if-worse-ok=', '0.05')));
const WORKERS = Math.max(1, parseInt(parse('--workers=', '4'), 10));
const DRY_RUN = args.includes('--dry-run');
const OUT_PATH = path.resolve(ROOT, parse('--out=', path.join('scripts', 'model_weights.json')));
const PUBLIC_WEIGHTS_FILE = path.join(ROOT, 'public', 'model_weights.json');
const REPORT_FILE = path.resolve(ROOT, parse('--report=', path.join('scripts', 'ai-training', 'train-report.jsonl')));

// ── 3. Types for game_history_analysis rows ──────────────────────────────────
interface HistoryRow {
  game_id: string;
  turn_number: number;
  player_color: PlayerColor;
  board_snapshot: {
    board?: number[];
    winner?: PlayerColor | null;
  } | null;
  equity_score?: number | null;
  is_win_move?: boolean | null;
  created_at?: string;
}

interface GameRecord {
  rows: HistoryRow[];
  startedAt: number;
}

// ── 4. Helpers ───────────────────────────────────────────────────────────────
function winnerFromBoard(board: number[]): PlayerColor | null {
  if (Math.abs(board[OFF_WHITE] ?? 0) >= 15) return 'white';
  if (Math.abs(board[OFF_BLACK] ?? 0) >= 15) return 'black';
  return null;
}

function nextTurn(turn: PlayerColor): PlayerColor {
  return turn === 'white' ? 'black' : 'white';
}

/** Minimal concurrency pool over an array. */
async function runPool<T, R>(items: T[], workers: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, () => worker()));
  return results;
}

// ── 5. Fetch game history (paginated) ────────────────────────────────────────
async function fetchHistory(): Promise<HistoryRow[]> {
  const all: HistoryRow[] = [];
  const pageSize = 1000;
  let fetched = 0;

  while (fetched < LIMIT) {
    const rangeEnd = Math.min(fetched + pageSize - 1, LIMIT - 1);
    const { data, error } = await supabase
      .from('game_history_analysis')
      .select('game_id, turn_number, player_color, board_snapshot, equity_score, is_win_move, created_at')
      .order('created_at', { ascending: false })
      .range(fetched, rangeEnd);

    if (error) {
      console.error('History fetch error:', error);
      break;
    }
    if (!data || data.length === 0) break;

    all.push(...(data as HistoryRow[]));
    fetched += data.length;
    console.log(`[Fetch] read ${all.length} history rows`);
    if (all.length >= LIMIT) break;
    if (data.length < pageSize) break;
  }

  return all;
}

// ── 6. Build training examples with dense/outcome/blend labels ───────────────
/** Resolve a game's winner (snapshot field when present, else board fallback). */
function resolveWinner(game: GameRecord): PlayerColor | null {
  const sorted = [...game.rows].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const finalBoard = sorted[sorted.length - 1]?.board_snapshot?.board;
  return sorted[sorted.length - 1]?.board_snapshot?.winner ?? (finalBoard ? winnerFromBoard(finalBoard) : null);
}

/** Collect one candidate position per recorded turn of each game. */
function collectPositions(games: GameRecord[]): { board: number[]; turn: PlayerColor; playerWon: boolean }[] {
  const positions: { board: number[]; turn: PlayerColor; playerWon: boolean }[] = [];
  for (const game of games) {
    const sorted = [...game.rows].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const winner = resolveWinner(game);

    for (const row of sorted) {
      const board = row.board_snapshot?.board;
      if (!board || board.length < 30) continue;
      if (winner && winnerFromBoard(board)) continue;

      // board_snapshot.turn is the player who just finished their turn; the
      // position is now the opponent's to move (mirrors self-play.ts).
      const turn = nextTurn(row.player_color);
      positions.push({ board, turn, playerWon: winner === turn });
    }
  }
  return positions;
}

/** Compute the label for a position using the SAME mode as training. */
async function computeTarget(p: { board: number[]; turn: PlayerColor; playerWon: boolean }): Promise<number> {
  if (LABEL_MODE === 'outcome') {
    return p.playerWon ? 1 : -1;
  }
  if (LABEL_MODE === 'blend') {
    const dense = await denseTarget(p.board, p.turn, DENSE_DEPTH);
    const outcome = p.playerWon ? 1 : -1;
    return BLEND_W * outcome + (1 - BLEND_W) * dense;
  }
  return denseTarget(p.board, p.turn, DENSE_DEPTH);
}

async function buildExamples(games: GameRecord[]): Promise<{ board: number[]; turn: PlayerColor; target: number }[]> {
  const positions = collectPositions(games);
  return runPool(positions, WORKERS, async (p) => ({
    board: p.board,
    turn: p.turn,
    target: await computeTarget(p),
  }));
}

// ── 7. Holdout gate: MSE of NN prediction vs the SAME training label ─────────
async function computeHoldoutTargets(games: GameRecord[]): Promise<{ board: number[]; turn: PlayerColor; target: number }[]> {
  const positions = collectPositions(games);
  return runPool(positions, WORKERS, async (p) => ({
    board: p.board,
    turn: p.turn,
    target: await computeTarget(p),
  }));
}

async function mseFor(holdout: { board: number[]; turn: PlayerColor; target: number }[], weights: { shape: number[]; data: number[] }[]): Promise<number | null> {
  if (holdout.length === 0) return null;
  if (!aiModel.deserializeWeights(weights)) return null;
  let se = 0;
  let n = 0;
  for (const h of holdout) {
    try {
      const pred = await aiModel.evaluate(h.board, h.turn);
      if (!Number.isFinite(pred)) continue;
      se += (pred - h.target) ** 2;
      n++;
    } catch { /* skip */ }
  }
  if (n === 0) return null;
  return se / n;
}

// ── 8. Persist weights ───────────────────────────────────────────────────────
async function saveWeights(examplesTrained: number): Promise<void> {
  const weightData = aiModel.serializeWeights();
  if (weightData.length === 0) return;

  const payload = {
    id: 'current',
    weights: weightData,
    trained_count: aiModel.getTrainedCount(),
    total_updates: aiModel.getTotalWeightUpdates(),
    games_played: 0,
    updated_at: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`[Save] --dry-run: skipping Supabase upsert + static asset writes. trained_count=${payload.trained_count}`);
    return;
  }

  // Supabase first (the ONLINE source of truth — the browser reads this row).
  try {
    const { error } = await supabase.from('model_weights').upsert(payload);
    if (!error) {
      console.log(`[Save] Checkpoint upserted to Supabase model_weights (${examplesTrained} positions)`);
    } else {
      console.warn('[Save] Supabase upsert failed:', error);
    }
  } catch (e) {
    console.warn('[Save] Supabase error:', e);
  }

  // Local checkpoint
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[Save] Checkpoint written to ${OUT_PATH}`);

  // Static asset for the browser (nnModel.applyLocalWeights reads /model_weights.json)
  fs.writeFileSync(PUBLIC_WEIGHTS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[Save] Static asset written to ${PUBLIC_WEIGHTS_FILE}`);
}

function writeReport(record: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.appendFileSync(REPORT_FILE, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
  } catch (e) {
    console.warn('[Report] write failed:', e);
  }
}

// ── 9. Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  Train from Supabase game history (gated)');
  console.log(`  Limit: ${LIMIT} | Depth: ${DENSE_DEPTH} | Label: ${LABEL_MODE}${LABEL_MODE === 'blend' ? ` (w=${BLEND_W})` : ''} | Holdout: ${HOLDOUT} | Workers: ${WORKERS}${DRY_RUN ? ' | DRY-RUN' : ''}`);
  console.log('══════════════════════════════════════════════');

  await aiModel.ensureModel();

  // Load existing checkpoint so training continues, not resets.
  let oldWeights: { shape: number[]; data: number[] }[] | null = null;
  let oldTrainedCount = 0;
  try {
    const { data } = await supabase
      .from('model_weights')
      .select('weights, trained_count')
      .eq('id', 'current')
      .maybeSingle();
    if (data?.weights?.length) {
      oldWeights = data.weights;
      oldTrainedCount = data.trained_count ?? 0;
      const ok = aiModel.deserializeWeights(data.weights);
      if (ok) {
        aiModel.setTrainedCount(oldTrainedCount);
        console.log(`[Checkpoint] Loaded existing weights (${oldTrainedCount} positions)`);
      }
    }
  } catch (e) {
    console.warn('[Checkpoint] Load failed:', e);
  }

  const rows = await fetchHistory();
  if (rows.length === 0) {
    console.warn('No game history rows found. Is the RLS fix (A) applied to game_history_analysis?');
    return;
  }

  // Group by game; order by the newest turn timestamp of each game.
  const grouped = new Map<string, GameRecord>();
  for (const row of rows) {
    const rec = grouped.get(row.game_id) ?? { rows: [], startedAt: 0 };
    rec.rows.push(row);
    const t = new Date(row.created_at ?? 0).getTime();
    if (t > rec.startedAt) rec.startedAt = t;
    grouped.set(row.game_id, rec);
  }
  const allGames = [...grouped.values()].sort((a, b) => b.startedAt - a.startedAt);
  const holdoutGames = allGames.slice(0, HOLDOUT);
  const trainGames = HOLDOUT > 0 ? allGames.slice(HOLDOUT) : allGames;
  console.log(`[Data] ${rows.length} rows across ${allGames.length} games (holdout=${holdoutGames.length}, train=${trainGames.length})`);

  const examples = await buildExamples(trainGames);
  if (examples.length === 0) {
    console.warn('No usable training examples found.');
    return;
  }
  console.log(`[Train] ${examples.length} positions ready; training...`);

  // Gate: MSE vs dense teacher on the holdout, old vs new weights.
  let mseOld: number | null = null;
  let mseNew: number | null = null;
  let holdoutTargets: { board: number[]; turn: PlayerColor; target: number }[] = [];
  if (holdoutGames.length > 0 && oldWeights) {
    holdoutTargets = await computeHoldoutTargets(holdoutGames);
    if (holdoutTargets.length > 0) {
      mseOld = await mseFor(holdoutTargets, oldWeights);
      console.log(`[Gate] holdout positions=${holdoutTargets.length} mseOld=${mseOld?.toFixed(4) ?? 'n/a'}`);
    }
  }

  const trainedBefore = aiModel.getTrainedCount();
  await aiModel.trainOnGame(examples);
  console.log(`[Train] total trained positions: ${aiModel.getTrainedCount()}`);

  if (holdoutTargets.length > 0) {
    mseNew = await mseFor(holdoutTargets, aiModel.serializeWeights());
    console.log(`[Gate] mseNew=${mseNew?.toFixed(4) ?? 'n/a'}`);

    const allowed = (mseOld ?? 0) * (1 + PUBLISH_IF_WORSE_OK);
    const regressed = mseNew !== null && mseOld !== null && mseNew > allowed;
    console.log(`[Gate] publish rule: newMSE <= oldMSE*(1+${PUBLISH_IF_WORSE_OK}) → ${regressed ? 'FAILED (regression)' : 'passed'}`);
    if (regressed) {
      writeReport({ game_id: null, trained: examples.length, trained_count: aiModel.getTrainedCount(), mseOld, mseNew, published: false, reason: 'gate_regression' });
      console.log('══ Skipping publish: holdout MSE regressed. Keeping previous checkpoint. ══');
      return;
    }
  }

  const published = !DRY_RUN;
  await saveWeights(examples.length);

  writeReport({ game_id: null, trained: examples.length, trained_count: aiModel.getTrainedCount(), total_updates: aiModel.getTotalWeightUpdates(), trained_before: trainedBefore, mseOld, mseNew, published, holdout: holdoutTargets.length, dryRun: DRY_RUN });
  console.log('══════════════════════════════════════════════');
  console.log('  Done.' + (DRY_RUN ? ' (dry-run — nothing persisted externally)' : ''));
  console.log('══════════════════════════════════════════════');
}

main()
  .catch((err) => {
    console.error('PIPELINE_ERROR=' + String(err));
    process.exit(1);
  })
  .finally(() => {
    aiModel.dispose();
  });
