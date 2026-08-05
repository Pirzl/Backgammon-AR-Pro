/**
 * EXECUTION AGENT
 *
 * Layers the tactical skill system on top of the current
 * expectimax engine result. Because expectimax here returns one
 * best move, ExecutionAgent returns that single move plus the
 * current skill firings.
 */

import { getBestMove } from '../expectimax';
import { planForContext } from './registry';
import type { SkillContext } from './types';
import type { Move as GameMove } from '../../../entities/game/types';

export interface ExecutionResult {
  move: GameMove | null;
  sequence: GameMove[];
  value: number;
  skillsFired: string[];
}

export class ExecutionAgent {
  static async choose(
    ctx: SkillContext,
    depth: number = 2,
  ): Promise<ExecutionResult> {
    const plan = planForContext(ctx);
    const skillsFired = plan.filter((p) => p.multiplier >= 1).map((p) => p.skill.id);

    const result = await getBestMove(ctx.state, depth);
    const sequence = result.move ? [result.move] : [];

    return { move: result.move, sequence, value: result.value, skillsFired };
  }
}
