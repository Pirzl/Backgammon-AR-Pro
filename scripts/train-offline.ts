import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { aiModel } from '../src/features/ai-worker/nn-model';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DEFAULT_OUT = path.resolve(ROOT, '.ai-model.weights.json');

const url = process.env.VITE_SUPABASE_URL as string;
const key = process.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error('Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const limit = Number(process.env.TRAIN_LIMIT ?? '200');
const outPath = process.env.TRAIN_OUT ?? DEFAULT_OUT;

const supabase = createClient(url, key);

type EvaluationRow = {
  id: string;
  equity: number;
  best_move: { from: number; to: number; die: number } | null;
  depth: number;
};

type GameLogRow = {
  id: string;
  moves: unknown;
  result: 'win' | 'loss' | 'draw' | string;
};

async function main() {
  const evalLimit = limit;
  const rows: EvaluationRow[] = [];
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('zobrist_evaluations')
      .select('id, equity, best_move, depth')
      .not('best_move', 'is', null)
      .order('created_at', { ascending: false })
      .limit(evalLimit);

      if (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      continue;
    }

    rows.push(...(data ?? []));
    break;
  }

  if (!rows.length) {
    const { data: fallbackData } = await supabase
      .from('zobrist_evaluations')
      .select('id, equity, depth')
      .order('created_at', { ascending: false })
      .limit(evalLimit);

    if (fallbackData) {
      const synthesized = fallbackData.map((item) => ({
        ...item,
        best_move: null,
      }));
      rows.push(...synthesized);
    }
  }

  let gameRows: GameLogRow[] = [];
  if (rows.length === 0) {
    const { data } = await supabase
      .from('game_logs')
      .select('id, moves, result')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.round(evalLimit * 0.5)));

    gameRows = data ?? [];
  }

  await aiModel.ensureModel();

  const examples: { board: number[]; turn: 'white' | 'black'; target: number }[] = [];

  for (const item of rows) {
    const target =
      typeof item.equity === 'number' && Number.isFinite(item.equity) ? item.equity : 0;
    if (item.best_move) {
      examples.push({ board: new Array(26).fill(0), turn: 'white', target });
    } else {
      examples.push({ board: new Array(26).fill(0), turn: 'white', target });
    }
  }

  for (const log of gameRows) {
    const target = log.result === 'win' ? 1 : log.result === 'loss' ? -1 : 0;
    examples.push({ board: new Array(26).fill(0), turn: 'white', target });
  }

  const hasRealSamples = examples.some((item) => item.target !== 0);
  if (!hasRealSamples) {
    examples.push({ board: new Array(26).fill(0), turn: 'white', target: 0 });
  }

  if (examples.length === 0) {
    console.warn('No training samples available.');
  } else {
    await aiModel.trainOnGame(examples);
  }

  if (!hasRealSamples) {
    console.warn('Trained only on fallback samples. Use game_logs or zobrist_evaluations.best_move for real training.');
  }

  const weights = aiModel.serializeWeights();
  fs.writeFileSync(outPath, JSON.stringify(weights, null, 2));
  console.log(`Trained on ${examples.length} samples.`);
  console.log(`Weights written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
