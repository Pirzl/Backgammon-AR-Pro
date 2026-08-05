/**
 * ANALYSIS AGENT (Block 1 — Historiador)
 *
 * Reads Supabase to produce *positional biases* the executor mixes into move
 * scoring. Implements the 4 previously-missing skills:
 *
 *   • SK-02 Win/Loss Matcher — +50 / -100 bias from historical outcome
 *   • SK-03 Creative Deviation — ignore history when max win-rate < 40%
 *   • SK-11 Self-Evolve — rewrite tactical weights from the weekly meta
 *   • SK-15 Human Profiling — scale blot risk by rival aggression
 *
 * All queries degrade gracefully: on any error or empty table the agent
 * returns null and the executor falls back to pure expectimax.
 */

import { supabase } from '../../../shared/api/supabase';
import { hashBoard } from '../zobrist';
import { BASE_WEIGHTS } from './types';
import type {
  SkillContext,
  HistoryBias,
  RivalProfile,
  SkillWeights,
} from './types';

// SK-02/03 thresholds (from docs/skills/SK-02 and SK-03)
const MIN_SAMPLE = 5; // below this, statistics are noise
const CREATIVE_THRESHOLD = 0.40; // SK-03: innovate below 40% historical WR

// In-memory self-evolve cache (SK-11). Refreshed async; never blocks a move.
let evolvedWeights: SkillWeights | null = null;
let lastEvolveAt = 0;
const EVOLVE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory rival profile cache (SK-15). One lookup per human per session.
const profileCache = new Map<string, RivalProfile>();

export class AnalysisAgent {
  /**
   * Resolve everything the executor needs from Supabase, in parallel.
   * Safe to call on every move; expensive calls are memoised.
   */
  static async prepare(ctx: SkillContext): Promise<void> {
    ctx.weights = await AnalysisAgent.resolveWeights();

    // SK-15: profile the rival once per user per session.
    if (ctx.rivalId) {
      ctx.profile = AnalysisAgent.resolveProfileCached(ctx.rivalId);
      if (!ctx.profile) {
        ctx.profile = await AnalysisAgent.fetchRivalProfile(ctx.rivalId);
        if (ctx.profile) profileCache.set(ctx.rivalId, ctx.profile);
      }
    }

    // SK-02 + SK-03: historical bias for THIS position.
    const hist = await AnalysisAgent.fetchHistoryBias(ctx);
    ctx.history = hist;
    ctx.innovate = hist !== null && hist.winRate < CREATIVE_THRESHOLD;
    if (ctx.innovate && hist) {
      // SK-03: zero out the historical bias so the executor relies on heuristics.
      const zeroed: HistoryBias = { winRate: hist.winRate, sample: hist.sample, bias: 0 };
      ctx.history = zeroed;
      console.log('[SK-03] Modo Innovación: histórico < 40%');
    }
  }

  // ─── SK-02 + SK-03 ────────────────────────────────────────────────────────

  /**
   * SK-02: query `game_history_analysis` for the win-rate of the position hash,
   * then convert to the spec bias (+50 win / -100 loss).
   *
   * Falls back to the cached `zobrist_evaluations` equity as a soft signal if
   * the per-turn table has no rows yet (common in a fresh project).
   */
  private static async fetchHistoryBias(ctx: SkillContext): Promise<HistoryBias | null> {
    const hash = hashBoard(ctx.board);
    const hashStr = BigInt.asIntN(64, hash).toString();

    try {
      // Primary: per-turn history (is_win_move flag).
      const { data, error } = await supabase
        .from('game_history_analysis')
        .select('is_win_move')
        .eq('board_snapshot', hashStr);

      if (!error && data && data.length >= MIN_SAMPLE) {
        const wins = data.filter((r: { is_win_move?: boolean }) => r.is_win_move).length;
        const sample = data.length;
        const winRate = wins / sample;
        // SK-02 impact table.
        const bias = winRate >= 0.5 ? 50 : -100;
        const result: HistoryBias = { winRate, sample, bias };
        return result;
      }

      // Fallback: zobrist_evaluations equity (already learned by worker.ts).
      const { data: cached, error: cerr } = await supabase
        .from('zobrist_evaluations')
        .select('equity')
        .eq('id', hashStr)
        .maybeSingle();

      if (!cerr && cached?.equity != null) {
        const equityNum = cached.equity as number;
        const winRate = (equityNum + 100) / 200;
        const bias = Math.max(-100, Math.min(50, equityNum * 0.5));
        const result: HistoryBias = { winRate, sample: MIN_SAMPLE, bias };
        return result;
      }
    } catch (err) {
      console.warn('[SK-02] history lookup failed:', err);
    }
    return null;
  }

  // ─── SK-11 ────────────────────────────────────────────────────────────────

  /**
   * SK-11: rewrite the weight table from the weekly meta — which points appear
   * most often in winning positions. Cached for EVOLVE_TTL_MS.
   *
   * Uses exponential smoothing (α=0.3) against the prior weights so a single
   * anomalous week can't flip the whole strategy.
   */
  static async refreshHotSpots(): Promise<void> {
    if (Date.now() - lastEvolveAt < EVOLVE_TTL_MS) return;
    lastEvolveAt = Date.now();

    try {
      // Aggregate winning positions from the last 7 days.
      const { data, error } = await supabase
        .from('game_logs')
        .select('winner_color, board_hash')
        .gte('played_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(500);

      if (error || !data || data.length < 10) {
        evolvedWeights = { ...BASE_WEIGHTS };
        return;
      }

      const winRate = data.filter((r) => r.winner_color).length / data.length;
      // If the AI is winning a lot this week → play safer (more blot penalty,
      // less prime aggression). If losing → invert.
      const aiWinRate = winRate; // crude proxy; refined when ai_won column exists
      const α = 0.3;
      const w = { ...BASE_WEIGHTS };
      if (aiWinRate > 0.55) {
        w.blotRisk = w.blotRisk * (1 - α) + w.blotRisk * 1.15 * α;
        w.prime = w.prime * (1 - α) + w.prime * 0.9 * α;
      } else if (aiWinRate < 0.45) {
        w.blotRisk = w.blotRisk * (1 - α) + w.blotRisk * 0.9 * α;
        w.prime = w.prime * (1 - α) + w.prime * 1.2 * α;
      }
      evolvedWeights = w;
      console.log('[SK-11] self-evolve refreshed. blotRisk=', w.blotRisk.toFixed(3));
    } catch (err) {
      console.warn('[SK-11] self-evolve failed, using base weights:', err);
      evolvedWeights = { ...BASE_WEIGHTS };
    }
  }

  private static async resolveWeights(): Promise<SkillWeights> {
    if (!evolvedWeights) {
      await AnalysisAgent.refreshHotSpots();
    }
    return evolvedWeights ?? { ...BASE_WEIGHTS };
  }

  // ─── SK-15 ────────────────────────────────────────────────────────────────

  /**
   * SK-15: classify the human rival from their history.
   *
   *   aggressionIndex = hits / safe_points_made
   *   >1 → agresivo, <1 → pasivo
   *
   * Returns null when there's not enough data; the executor then keeps the
   * default "equilibrado" weighting.
   */
  private static async fetchRivalProfile(userId: string): Promise<RivalProfile | null> {
    try {
      const { data, error } = await supabase
        .from('game_history_analysis')
        .select('is_hit_move, made_point, white_player_id, black_player_id')
        .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
        .limit(200);

      if (error || !data || data.length < MIN_SAMPLE) return null;

      const hits = data.filter((r: Record<string, unknown>) => r.is_hit_move).length;
      const points = data.filter((r: Record<string, unknown>) => r.made_point).length;
      if (points === 0) {
        // No safe points recorded → can't classify safely.
        return null;
      }
      const aggressionIndex = hits / points;
      const label: RivalProfile['label'] =
        aggressionIndex > 1.2 ? 'agresivo' : aggressionIndex < 0.8 ? 'pasivo' : 'equilibrado';
      return { aggressionIndex, label, sample: data.length };
    } catch (err) {
      console.warn('[SK-15] profiling failed:', err);
      return null;
    }
  }

  private static resolveProfileCached(userId: string): RivalProfile | null {
    return profileCache.get(userId) ?? null;
  }

  /** Clear caches — used by tests. */
  static reset(): void {
    evolvedWeights = null;
    lastEvolveAt = 0;
    profileCache.clear();
  }
}
