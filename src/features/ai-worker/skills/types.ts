/**
 * SKILL SYSTEM — Type definitions
 *
 * The 16 documented skills (docs/skills/SK-01..SK-16) are exposed as a uniform
 * registry. Each skill is one of three kinds:
 *
 *   - ANALYZER  : produces a positional *bias* (+/- points) used to re-rank
 *                 candidate moves. Backed by Supabase history (Block 1).
 *   - SELECTOR  : decides, from the current context, which TACTICAL skills
 *                 should fire and with what priority weight (the "executor"
 *                 consumes this list in priority order).
 *   - TACTICAL  : pure function of (board, move, context) → score delta.
 *                 These are the field heuristics (Block 3) formalised as
 *                 first-class skills the engine can dispatch to.
 *
 * The flow inside the engine is:
 *
 *   1. AnalysisAgent.run(context)   → collects analyzer biases
 *   2. ExecutionAgent.plan(context) → ordered, weighted skill list
 *   3. ExecutionAgent.score(move)   → expectimax value + Σ(tactical deltas)
 *                                      + Σ(analyzer biases)
 *
 * See docs/skills/README.md for the block/skill map.
 */

import type { GameState, PlayerColor } from '../../../entities/game/types';
import type { Move } from '../../../entities/game/types';
export type { Move };

/** Identifier matching docs/skills/SK-XX-*.md */
export type SkillId =
  | 'SK-01' | 'SK-02' | 'SK-03' | 'SK-04' | 'SK-05'
  | 'SK-06' | 'SK-07' | 'SK-08' | 'SK-09' | 'SK-10'
  | 'SK-11' | 'SK-13' | 'SK-14' | 'SK-15' | 'SK-16';

export type SkillBlock = 'historian' | 'strategist' | 'tactician';

/**
 * Shared context handed to every skill.
 * `rivalId` / `profile` / `weights` are populated by the AnalysisAgent before
 * tactical skills run, so SK-07/08/etc. can react to profiling + self-evolve.
 */
export interface SkillContext {
  state: GameState;
  aiColor: PlayerColor;
  /** Board *before* the candidate move (used by analyzers). */
  board: number[];
  /** Dice still available for this turn. */
  dice: number[];
  /** Opponent (human) user id, when known. Feeds SK-15. */
  rivalId?: string | null;
  /** Resolved by AnalysisAgent (SK-15). null = unknown / equilibrado. */
  profile?: RivalProfile | null;
  /** Resolved by AnalysisAgent (SK-11). Falls back to base WEIGHTS. */
  weights?: SkillWeights;
  /** Resolved by AnalysisAgent (SK-02/03). null = no usable history. */
  history?: HistoryBias | null;
  /** True when the AnalysisAgent decided to ignore cached history (SK-03). */
  innovate?: boolean;
}

export interface RivalProfile {
  aggressionIndex: number; // >1 agresivo, <1 pasivo
  label: 'pasivo' | 'equilibrado' | 'agresivo';
  sample: number;
}

export interface HistoryBias {
  /** win-rate [0..1] of the historically chosen move for this position. */
  winRate: number;
  sample: number;
  /** +50 if historical move led to win, -100 if loss (per SK-02 spec). */
  bias: number;
}

/**
 * Mutable weight table. SK-11 (self-evolve) rewrites these in-memory at runtime;
 * everything else reads them. Mirrors expectimax `WEIGHTS` so the existing
 * heuristic keeps working unchanged.
 */
export interface SkillWeights {
  pipCount: number;
  raceMultiplier: number;
  wastage: number;
  bearOff: number;
  prime: number;
  anchor: number;
  homeBoard: number;
  connectivity: number;
  diversify: number;
  blotRisk: number;
  barPenalty: number;
  barReward: number;
  hitBonus: number;
  trapped: number;
  gammonThreat: number;
  timing: number;
  /** SK-16 — bonus for bearing off with the exact die. */
  bearOffExactDie: number;
}

export const BASE_WEIGHTS: SkillWeights = {
  pipCount: -0.18,
  raceMultiplier: 1.8,
  wastage: -0.25,
  bearOff: 2.5,
  prime: 1.3,
  anchor: 0.9,
  homeBoard: 0.7,
  connectivity: 0.4,
  diversify: 0.35,
  blotRisk: 2.8,
  barPenalty: 4.5,
  barReward: 2.2,
  hitBonus: 1.2,
  trapped: 0.5,
  gammonThreat: 1.5,
  timing: -0.3,
  bearOffExactDie: 15, // SK-16 spec: "+15 puntos"
};

// ─── Skill descriptors ──────────────────────────────────────────────────────

export interface AnalyzerSkill {
  id: SkillId;
  block: SkillBlock;
  kind: 'analyzer';
  /** True when Supabase data is required and may be unavailable. */
  requiresSupabase: boolean;
  run: (ctx: SkillContext) => Promise<HistoryBias | null>;
}

export interface SelectorSkill {
  id: SkillId;
  block: SkillBlock;
  kind: 'selector';
  /** Higher priority fires first; ties broken by registration order. */
  priority: number;
  /** Returns the skill ids this selector wants active, with multipliers. */
  select: (ctx: SkillContext) => Array<{ id: SkillId; multiplier: number }>;
}

export interface TacticalSkill {
  id: SkillId;
  block: SkillBlock;
  kind: 'tactical';
  /** True if this skill applies to the candidate move given the context. */
  applies: (move: Move, ctx: SkillContext) => boolean;
  /** Score delta to add to the candidate move's evaluation. */
  score: (move: Move, ctx: SkillContext) => number;
}

export type Skill = AnalyzerSkill | SelectorSkill | TacticalSkill;
