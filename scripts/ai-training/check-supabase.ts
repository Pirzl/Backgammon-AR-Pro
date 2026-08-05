import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = '.';
const targets = [
  // Supabase core
  'src/shared/api/supabase.ts',
  'src/features/networking/lib/useSupabaseRealtime.ts',
  'src/features/networking/lib/SupabaseSignaling.ts',
  // Ranking
  'src/features/ranking/rankCalculator.ts',
  'src/features/ranking/constants.ts',
  'src/features/ranking/api.ts',
  'src/features/ranking/components/RankBadge.tsx',
  'src/features/ranking/components/GameOverRankPopup.tsx',
  'src/features/game-board/lib/usePlayerStats.ts',
  // Wallet / betting
  'src/features/game-board/lib/useWallet.ts',
  // Game sync
  'src/features/networking/lib/useGameSync.ts',
];

for (const rel of targets) {
  const path = join(root, rel);
  const state = existsSync(path) ? 'found' : 'missing';
  console.log(`[Supabase] ${state}: ${rel}`);
  if (state === 'found') {
    const text = readFileSync(path, 'utf8').toLowerCase();
    const markers = ['supabase', 'auth', 'session', 'router', 'google', 'discord', 'rank', 'wallet', 'bet'];
    console.log(`  hits=${markers.filter((m) => text.includes(m)).length}`);
  }
}
