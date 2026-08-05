/**
 * SKILL REGISTRY
 *
 * Central catalog of all 16 skills. Skills self-register; the two agents
 * (AnalysisAgent, ExecutionAgent) query the registry by kind/block.
 *
 * Status reflects docs/skills/README.md:
 *   - Block 2 + 3 tactical skills: promoted from implicit heuristics in
 *     expectimax.ts to first-class registry entries.
 *   - Block 1 analyzer skills: NEW (previously missing — SK-02/03/11/15).
 */

import type { Skill, SkillId } from './types';

const REGISTRY = new Map<SkillId, Skill>();

export function registerSkill(skill: Skill): void {
  REGISTRY.set(skill.id, skill);
}

export function getSkill(id: SkillId): Skill | undefined {
  return REGISTRY.get(id);
}

export function allSkills(): Skill[] {
  return Array.from(REGISTRY.values());
}

export function analyzerSkills() {
  return allSkills().filter((s): s is Extract<Skill, { kind: 'analyzer' }> => s.kind === 'analyzer');
}

export function selectorSkills() {
  return allSkills()
    .filter((s): s is Extract<Skill, { kind: 'selector' }> => s.kind === 'selector')
    .sort((a, b) => b.priority - a.priority); // highest priority first
}

export function tacticalSkills() {
  return allSkills().filter((s): s is Extract<Skill, { kind: 'tactical' }> => s.kind === 'tactical');
}

/**
 * Pull tactical skills in the order/priority chosen by the selectors for this
 * context. If no selector fires, every tactical skill runs with multiplier 1
 * (preserves the legacy behaviour of expectimax.ts).
 */
export function planForContext(
  ctx: Parameters<Extract<Skill, { kind: 'selector' }>['select']>[0],
): Array<{ skill: Extract<Skill, { kind: 'tactical' }>; multiplier: number }> {
  const wanted = new Map<SkillId, number>();
  let anyFired = false;

  for (const selector of selectorSkills()) {
    const picks = selector.select(ctx);
    if (picks.length > 0) anyFired = true;
    for (const p of picks) {
      // Keep the max multiplier if two selectors both boost the same skill.
      wanted.set(p.id, Math.max(wanted.get(p.id) ?? 0, p.multiplier));
    }
  }

  const tacticals = tacticalSkills();
  if (!anyFired) {
    return tacticals.map((skill) => ({ skill, multiplier: 1 }));
  }

  // Selected tacticals first (priority order), then the rest at mult 0.5 so
  // they still contribute but cannot override the prioritised ones.
  const out: Array<{ skill: Extract<Skill, { kind: 'tactical' }>; multiplier: number }> = [];
  for (const [id, mult] of wanted) {
    const s = tacticals.find((t) => t.id === id);
    if (s) out.push({ skill: s, multiplier: mult });
  }
  for (const s of tacticals) {
    if (!wanted.has(s.id)) out.push({ skill: s, multiplier: 0.5 });
  }
  return out;
}
