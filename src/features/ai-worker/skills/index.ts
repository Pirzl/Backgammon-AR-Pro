/**
 * SKILL SYSTEM — barrel
 *
 * Importing this module registers every skill (Block 1/2/3) into the registry.
 * The agents (AnalysisAgent, ExecutionAgent) are re-exported so the engine
 * only needs `import { runSkillSystem } from './skills'`.
 */

import type { Move as GameMove } from '../../../entities/game/types';

// Side-effect imports: each module registers its skills on load.
import './tactical';
import './selectors';

// Analyzer skills are methods on AnalysisAgent (no registration side-effects).

export { AnalysisAgent } from './analysis-agent';
export { ExecutionAgent } from './execution-agent';
export type { ExecutionResult } from './execution-agent';
export {
  registerSkill,
  getSkill,
  allSkills,
  analyzerSkills,
  selectorSkills,
  tacticalSkills,
  planForContext,
} from './registry';
export { BASE_WEIGHTS } from './types';
export type {
  Skill,
  SkillId,
  SkillBlock,
  SkillContext,
  SkillWeights,
  HistoryBias,
  RivalProfile,
  AnalyzerSkill,
  SelectorSkill,
  TacticalSkill,
} from './types';

// `Move` is the canonical game Move. Skill modules use it under that same name.
export type Move = GameMove;

/**
 * One-call entry point used by worker.ts.
 *
 *   const ctx = await runSkillSystem({ state, aiColor, board, dice, rivalId });
 *   const result = await ExecutionAgent.choose(ctx, depth, oppCap);
 */
import { AnalysisAgent } from './analysis-agent';
import type { SkillContext } from './types';

export async function buildSkillContext(
  partial: Omit<SkillContext, 'weights' | 'profile' | 'history' | 'innovate'>,
): Promise<SkillContext> {
  const ctx: SkillContext = { ...partial, weights: undefined, profile: null, history: null, innovate: false };
  await AnalysisAgent.prepare(ctx);
  return ctx;
}
