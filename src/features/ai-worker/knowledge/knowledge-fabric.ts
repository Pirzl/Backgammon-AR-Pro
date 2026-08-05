/**
 * VIVO Knowledge Fabric — Supabase + offline assets + playbook.
 *
 * This module preserves operational knowledge about the project's
 * data layer so it can be reasoned about at runtime without hardcoding
 * fragile assumptions across game/UI code:
 * - remote Supabase tables and roles used by VIVO
 * - local offline fallback assets bundled with the build
 * - how those sources should be combined for answers
 *
 * NOTE: this file is intentionally knowledge-only. It does not load
 * credentials, secrets, or .env contents. Keep keys in .env.
 */

export interface SupabaseDataset {
  readonly kind: 'supabase';
  readonly tables: readonly string[];
  readonly fallbackBehavior: string;
}

export interface OfflineAssetDataset {
  readonly kind: 'offline-asset';
  readonly assets: readonly string[];
  readonly updateStrategy: string;
}

export interface SkillManifestItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly path: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly source: string;
}

export interface ToolRegistryItem {
  readonly name: string;
  readonly surface: string;
  readonly description: string;
  readonly risk: string;
  readonly tags: readonly string[];
}

export interface KnowledgeFabric {
  readonly supabase: SupabaseDataset;
  readonly offlineAssets: OfflineAssetDataset;
  readonly mergeRule: string;
  readonly lastVerifiedFromCode: string;
  readonly skills: readonly SkillManifestItem[];
  readonly tools: readonly ToolRegistryItem[];
}

export const vivoKnowledgeFabric: KnowledgeFabric = Object.freeze({
  supabase: Object.freeze({
    kind: 'supabase',
    tables: [
      'profiles',
      'wallets',
      'matches',
      'game_logs',
      'tournaments',
      'player_directory',
      'zobrist_evaluations',
      'crm_inbox',
      'session_state',
      'player_rank',
      'calibration',
      'admin_audit',
    ],
    fallbackBehavior:
      'When Supabase auth/session/presence data is unavailable, use localStorage/sessionStorage + bundled offline assets.',
  }) as SupabaseDataset,

  offlineAssets: Object.freeze({
    kind: 'offline-asset',
    assets: [
      'public/ai-wisdom.json',
      'public/model_weights.json',
      'localStorage wisdom counters via local-wisdom.ts',
    ],
    updateStrategy:
      'Self-play/training writes are batched to remote Supabase tables, then reflected into bundled/built assets only where explicitly designed.',
  }) as OfflineAssetDataset,

  mergeRule:
    'For AI wisdom/stats: Supabase is source of truth; local/bundled assets are fallback. For gameplay, the browser-side rules/model still owns rules, state transitions, and offline play.',

  lastVerifiedFromCode: 'verified from tree: GameSettingsContext, api.ts, local-wisdom.ts, worker.ts, public assets, admin hooks',

  skills: Object.freeze([
    {
      id: 'vivo-backgammon-dev',
      name: 'vivo-backgammon-dev',
      category: 'project',
      path: 'project/vivo-project',
      description: 'VIVO Backgammon development workflow and guardrails.',
      tags: ['vivo', 'backgammon', 'game-dev'],
      source: 'local',
    },
    {
      id: 'vivo-game-ui-animation',
      name: 'vivo-game-ui-animation',
      category: 'game-development',
      path: 'game-development/vivo-game-ui-animation',
      description: 'VIVO checker overlay wiring and debugging.',
      tags: ['vivo', 'ui', 'animation'],
      source: 'local',
    },
    {
      id: 'obsidian-vault-stewardship',
      name: 'obsidian-vault-stewardship',
      category: 'note-taking',
      path: 'note-taking/obsidian-vault-stewardship',
      description: 'Setup or repair an Obsidian vault and workspace state.',
      tags: ['obsidian', 'vault', 'notes'],
      source: 'local',
    },
    {
      id: 'vivo-hand-tracking',
      name: 'vivo-hand-tracking',
      category: 'project',
      path: 'features/hand-tracking',
      description: 'AR hand tracking, camera, calibration, gestures, and board geometry for VIVO.',
      tags: ['vivo', 'ar', 'mediapipe', 'hand-tracking', 'camera'],
      source: 'project',
    },
    {
      id: 'vivo-game-board',
      name: 'vivo-game-board',
      category: 'project',
      path: 'features/game-board',
      description: 'Board UI, interaction, rules execution, AI service, wallet/betting, and minimodal UX.',
      tags: ['vivo', 'board', 'ui', 'rules', 'ai', 'betting'],
      source: 'project',
    },
    {
      id: 'vivo-ai-worker',
      name: 'vivo-ai-worker',
      category: 'project',
      path: 'features/ai-worker',
      description: 'Self-play training, expectimax, NN model, knowledge fabric, zobrist cache, and API.',
      tags: ['vivo', 'ai', 'training', 'expectimax', 'neural-network'],
      source: 'project',
    },
    {
      id: 'vivo-networking',
      name: 'vivo-networking',
      category: 'project',
      path: 'features/networking',
      description: 'Supabase realtime, signaling, game sync, lobby, video chat, and remote cursors.',
      tags: ['vivo', 'networking', 'supabase', 'webrtc', 'realtime'],
      source: 'project',
    },
    {
      id: 'vivo-ranking',
      name: 'vivo-ranking',
      category: 'project',
      path: 'features/ranking',
      description: 'Rank calculator, rank API, rank badge, and game-over rank popup.',
      tags: ['vivo', 'ranking', 'gamification'],
      source: 'project',
    },
    {
      id: 'vivo-minigames',
      name: 'vivo-minigames',
      category: 'project',
      path: 'features/minigames',
      description: 'Pong minigame, physics, audio, and Web Worker integration.',
      tags: ['vivo', 'minigame', 'pong'],
      source: 'project',
    },
  ]) as readonly SkillManifestItem[],

  tools: Object.freeze([
    {
      name: 'terminal',
      surface: 'core',
      description: 'Run shell commands in the Hermes terminal.',
      risk: 'medium',
      tags: ['shell', 'exec'],
    },
    {
      name: 'web_search',
      surface: 'core',
      description: 'Search the web and return results.',
      risk: 'low',
      tags: ['web', 'search'],
    },
    {
      name: 'browser_navigate',
      surface: 'core',
      description: 'Open a URL in the embedded browser.',
      risk: 'medium',
      tags: ['browser', 'web'],
    },
    {
      name: 'read_file',
      surface: 'core',
      description: 'Read text files with line numbers.',
      risk: 'low',
      tags: ['files', 'read'],
    },
    {
      name: 'patch',
      surface: 'core',
      description: 'Patch files with find/replace.',
      risk: 'high',
      tags: ['files', 'edit'],
    },
    {
      name: 'write_file',
      surface: 'core',
      description: 'Write a file from scratch.',
      risk: 'high',
      tags: ['files', 'edit'],
    },
    {
      name: 'vivo-self-play',
      surface: 'project',
      description: 'Ejecuta una partida real de entrenamiento desde `scripts/ai-training/run-one-game.ts`.',
      risk: 'medium',
      tags: ['vivo', 'training', 'ai'],
    },
    {
      name: 'vivo-expectimax-probe',
      surface: 'project',
      description: 'Ejecuta una sonda de `getBestMove()` para medir tiempo por profundidad.',
      risk: 'low',
      tags: ['vivo', 'ai', 'expectimax'],
    },
    {
      name: 'vivo-supabase-auth-check',
      surface: 'project',
      description: 'Escanea rutas clave y cuenta referencias a Supabase/auth/session.',
      risk: 'low',
      tags: ['vivo', 'supabase', 'auth'],
    },
  ]) as readonly ToolRegistryItem[],

  meta: {
    generated_at: '2026-07-31T10:06:00Z',
    source: 'manual + repo scan',
    notes: 'Amplied with VIVO-specific skills/tools and linked to executable scripts.',
  } as const,
});

export function discoverSkills(query?: string): readonly SkillManifestItem[] {
  const q = (query || '').trim().toLowerCase();
  const items = vivoKnowledgeFabric.skills;
  if (!q) return items;
  return items.filter(
    (item) =>
      item.id.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

export function discoverTools(query?: string): readonly ToolRegistryItem[] {
  const q = (query || '').trim().toLowerCase();
  const items = vivoKnowledgeFabric.tools;
  if (!q) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.risk.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

export function describeVivoKnowledge(): string {
  const f = vivoKnowledgeFabric;
  return [
    `VIVO knowledge fabric:`,
    `- Supabase datasets: ${f.supabase.tables.join(', ')}`,
    `- Offline assets: ${f.offlineAssets.assets.join('; ')}`,
    `- Merge rule: ${f.mergeRule}`,
    `- Verified from: ${f.lastVerifiedFromCode}`,
  ].join('\n');
}
