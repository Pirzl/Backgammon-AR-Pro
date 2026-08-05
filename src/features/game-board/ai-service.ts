import { getValidMoves, applyMove, isValidMove } from "../../entities/game/rules";
import { OFF_WHITE, OFF_BLACK } from "../../entities/game/constants";
import { evaluatePosition as heuristicEvaluate, expectimaxChance } from "../ai-worker/expectimax";
import { nnModel } from "./nn-model";
import { hashBoard } from "../ai-worker/zobrist";
import { fetchEvaluation, storeEvaluation } from "../ai-worker/api";
import { supabase } from "../../shared/api/supabase";
import type { GameState } from "../../entities/game/types";
import { generateAllTurnSequences } from "../../entities/game/full-turn-generator";
import { buildSkillContext } from "../ai-worker/skills";
import type { SkillContext, TacticalSkill } from "../ai-worker/skills";
import { formatPositionSummary, formatLegalMovesSummary } from "../ai-worker/position-view";
import { recordGeminiCall } from "./lib/geminiUsage";
import { getOpeningBook, getExpertOpeningSequence, applyOpeningBonus } from "./opening-book";

/**
 * REFORM (2026-08-03): the L9-10 skill reflective override is DISABLED.
 *
 * Evidence: in replay 1bc6afc9 the skill layer picked worse moves than the base
 * blend in 18/25 AI turns (~-32 score points total; e.g. T8 -3.5, T12 -5.9),
 * and its deltas were unstable/unreproducible (the runtime pick at T8 wasn't
 * reproduced by any offline replica). The base blend (NN+heur+expectimax) alone
 * already matches the deep-3 oracle 24/25 in that game and 34/34 in dd813cdb.
 *
 * Flip to true to re-enable the reflective override (skills as final arbiter).
 * The skill modules (SK-07/08/09/10/14/16, planForContext, scoreForSequenceBySkills)
 * stay in place and are only exercised when this flag is on.
 */
const ENABLE_REFLECTIVE_OVERRIDE = false;

type Difficulty = number;

function clampDifficulty(d?: Difficulty): Difficulty {
  if (typeof d !== "number") return 5;
  return Math.max(1, Math.min(10, Math.round(d)));
}

/**
 * Effective score of a candidate sequence for the selection loop.
 * A reflect-marked sequence is compared by its reflective score; a base one by
 * its raw score. BUGFIX (2026-08-01): the selection condition previously parsed
 * `chosenBy === 'reflect' ? reflectiveScore : score > bestScore` as a ternary,
 * so any reflect-marked sequence was selected unconditionally (a nonzero number
 * is truthy). Keep this comparison in one pure helper so the precedence can't
 * regress.
 */
export function effectiveCandidateScore(
  chosenBy: 'base' | 'reflect',
  score: number,
  reflectiveScore: number,
): number {
  return chosenBy === 'reflect' ? reflectiveScore : score;
}

/**
 * Select the winning candidate sequence under the L9-10 reflective override.
 *
 * Each candidate carries a raw `score` (NN+heuristic+expectimax blend) and an
 * optional skill `delta` (null = skills were unavailable/invalid for it). A
 * candidate is "reflect-marked" when its skill-adjusted score beats the current
 * best's skill-adjusted score by > 0.05; the winning effective score is used
 * for storage/diagnostics.
 *
 * BUGFIX (2026-08-03): the base best's delta is now applied only once — the
 * comparison uses `bestBaseScore + bestDelta`. Previously bestScore (which
 * already holds base+delta when the best was reflect-marked) was reused and the
 * delta double-counted, biasing the pick toward whichever sequence came first
 * in the presorted order.
 */
export function selectBestSequence(
  candidates: Array<{ score: number; delta: number | null }>,
): { index: number; effectiveScore: number } {
  let bestIndex = 0;
  let bestScore = -Infinity;
  let bestBaseScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const { score, delta } = candidates[i]!;
    let eff = score;
    if (delta !== null) {
      const reflectiveScore = score + delta;
      const baseDelta = candidates[bestIndex]!.delta;
      const baseReflectiveScore = baseDelta !== null ? bestBaseScore + baseDelta : bestBaseScore;
      if (reflectiveScore > baseReflectiveScore + 0.05) eff = reflectiveScore;
    }
    if (eff > bestScore) {
      bestScore = eff;
      bestBaseScore = score;
      bestIndex = i;
    }
  }
  return { index: bestIndex, effectiveScore: bestScore };
}

// r7/r10: safe-slotting + deny-the-rival. A lone checker that no opponent checker
// can reach within 6 pips is a safe slot and is rewarded. (Exposed blots are
// already penalised by SK-07 and the heuristic, so this stays purely additive.)
function safeSlotDelta(
  sequence: Array<{ from: number; to: number; die: number }>,
  boardAfter: number[],
  aiColor: 'white' | 'black',
): number {
  const sign = aiColor === 'white' ? 1 : -1;
  const dir = aiColor === 'white' ? -1 : 1;
  let delta = 0;
  for (const move of sequence) {
    const dest = move.to;
    if (dest < 1 || dest > 24) continue;
    const v = boardAfter[dest] ?? 0;
    const isLone = (sign > 0 && v === 1) || (sign < 0 && v === -1);
    if (!isLone) continue;
    let threat = 0;
    for (let pip = 1; pip <= 6; pip++) {
      const idx = dest + dir * pip;
      if (idx < 1 || idx > 24) continue;
      const t = boardAfter[idx] ?? 0;
      if ((sign > 0 && t < 0) || (sign < 0 && t > 0)) threat += 0.35 + (6 - pip) * 0.12;
    }
    if (threat === 0) delta += 0.25;
  }
  return delta;
}

function getDifficultyWeights(difficulty: Difficulty): { nn: number; heuristic: number; strategyIntensity: number } {
  if (difficulty <= 2) return { nn: 0.05, heuristic: 0.95, strategyIntensity: 1.0 };
  if (difficulty === 3) return { nn: 0.10, heuristic: 0.90, strategyIntensity: 1.0 };
  if (difficulty === 4) return { nn: 0.20, heuristic: 0.80, strategyIntensity: 1.0 };
  if (difficulty === 5) return { nn: 0.30, heuristic: 0.70, strategyIntensity: 1.0 };
  if (difficulty === 6) return { nn: 0.40, heuristic: 0.60, strategyIntensity: 1.0 };
  if (difficulty === 7) return { nn: 0.50, heuristic: 0.50, strategyIntensity: 1.2 };
  if (difficulty === 8) return { nn: 0.60, heuristic: 0.40, strategyIntensity: 1.4 };
  if (difficulty === 9) return { nn: 0.40, heuristic: 0.60, strategyIntensity: 1.7 };
  return { nn: 0.40, heuristic: 0.60, strategyIntensity: 2.0 };
}

type AIConfig = {
  mode: 'random' | 'first' | 'noisy' | 'full';
  noise: number;
  maxSequences: number;
  expectimaxDepth: number;
  oppWeight: number;
};

function getAIConfig(difficulty: Difficulty): AIConfig {
  if (difficulty <= 1) return { mode: 'random', noise: 0, maxSequences: 0, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 2) return { mode: 'first', noise: 0, maxSequences: 0, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 3) return { mode: 'first', noise: 0, maxSequences: 0, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 4) return { mode: 'first', noise: 0, maxSequences: 0, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 5) return { mode: 'noisy', noise: 8, maxSequences: 40, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 6) return { mode: 'noisy', noise: 4, maxSequences: 80, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 7) return { mode: 'noisy', noise: 2, maxSequences: 150, expectimaxDepth: 0, oppWeight: 0 };
  if (difficulty === 8) return { mode: 'full', noise: 1, maxSequences: 200, expectimaxDepth: 1, oppWeight: 0.2 };
  if (difficulty === 9) return { mode: 'full', noise: 0, maxSequences: 500, expectimaxDepth: 1, oppWeight: 0.3 };
  return { mode: 'full', noise: 0, maxSequences: 500, expectimaxDepth: 2, oppWeight: 0.4 };
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

async function pickBestMove(
  legalMoves: { from: number; to: number; die: number }[],
  availableDice: number[],
  simBoard: number[],
  aiColor: "white" | "black",
  difficulty: Difficulty = 5
): Promise<{ from: number; to: number; die: number } | null> {
  const candidates = legalMoves.filter((m) => availableDice.includes(m.die));
  if (candidates.length === 0) return null;

  const config = getAIConfig(difficulty);

  if (config.mode === 'random' && candidates.length > 0) {
    return pickRandom(candidates);
  }

  if (config.mode === 'first' && candidates.length > 0) {
    return candidates[0]!;
  }

  return evaluateBest(candidates, simBoard, aiColor, difficulty);
}

async function evaluateBest(
  candidates: { from: number; to: number; die: number }[],
  simBoard: number[],
  aiColor: "white" | "black",
  difficulty: Difficulty = 5
): Promise<{ from: number; to: number; die: number }> {
  const difficultyWeights = getDifficultyWeights(difficulty);

  let bestMove = candidates[0]!;
  let bestScore = -Infinity;

  for (const move of candidates) {
    const resultBoard = applyMove(simBoard, move, aiColor);
    let score: number;
    try {
      // NN re-enabled at all levels (2026-08-01): the self-learning pipeline
      // (A+B+C) now produces trained weights via /model_weights.json.
      const nnScore = await nnModel.evaluate(resultBoard, aiColor);
      const heuristicScore = heuristicEvaluate(resultBoard, aiColor, difficultyWeights.strategyIntensity);
      score = (nnScore * 50 * difficultyWeights.nn) + (heuristicScore * difficultyWeights.heuristic);
    } catch (e) {
      console.warn("AI: NN Evaluation failed, using heuristic fallback", e);
      score = heuristicEvaluate(resultBoard, aiColor, difficultyWeights.strategyIntensity);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// ─── Gemini proxy via Supabase Edge Function (API key is SERVER-SIDE ONLY) ───
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const GEMINI_PROXY_URL = `${SUPABASE_URL}/functions/v1/gemini-proxy`;

/** Call Gemini via Edge Function proxy (API key stays server-side) */
// Raised once per session when the daily Gemini quota is exhausted, so callers
// stop spending calls / popping up logs for the rest of the day.
let quotaExhaustedFired = false;

async function callGeminiProxy(
  prompt: string,
  mode: 'analysis' | 'moves' = 'moves'
): Promise<string | { moves: { from: number; die: number }[] } | null> {
  // Once the daily shared quota is known to be exhausted, stop hammering the
  // proxy for the rest of the session (avoids a 429 retry loop and wasted calls).
  if (quotaExhaustedFired) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ prompt, mode }),
    });
    recordGeminiCall();

    if (response.status === 429) {
      if (!quotaExhaustedFired) {
        quotaExhaustedFired = true;
        console.warn('[Gemini] daily quota exhausted; entering offline AI mode for the day.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vivo-quota-exhausted'));
        }
      }
      return null;
    }

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('[Gemini Proxy Request Failed]:', err);
    return null;
  }
}

/**
 * A2: Greedy fallback used whenever full-turn sequence search produces nothing.
 * Plays the best single move per die until no legal move remains. If there is
 * genuinely no legal move it returns an empty array (a legitimate skip).
 */
async function pickGreedyFallback(
  boardState: number[],
  dice: number[],
  gameState: GameState,
  aiColor: 'white' | 'black',
  effectiveDifficulty: Difficulty
): Promise<{ from: number; to: number; die: number }[]> {
  const finalMoves: { from: number; to: number; die: number }[] = [];
  const availableDice = [...dice];
  let simBoard = [...boardState];

  while (availableDice.length > 0) {
    const simUsedDice = [...gameState.usedDice, ...finalMoves.map((m) => m.die)];
    const simState = { ...gameState, board: simBoard, usedDice: simUsedDice } as GameState;
    const legalMoves = getValidMoves(simState);
    if (legalMoves.length === 0) break;

    const picked = await pickBestMove(legalMoves, availableDice, simBoard, aiColor, effectiveDifficulty);
    if (!picked) break;

    availableDice.splice(availableDice.indexOf(picked.die), 1);
    finalMoves.push({ from: picked.from, to: picked.to, die: picked.die });
    simBoard = applyMove(simBoard, picked, aiColor);
  }

  return finalMoves;
}

export async function getGrandmasterMove(
  boardState: number[],
  dice: number[],
  gameState?: GameState,
  difficulty?: number
): Promise<{ moves: { from: number; to: number; die: number }[] } | null> {
  const aiColor = gameState?.turn || "black";
  const effectiveDifficulty = clampDifficulty(difficulty);

  // Dev-only trace: shows current move choice without changing gameplay.
  if (import.meta.env.DEV) {
    const barIdx = aiColor === 'white' ? 27 : 26;
    const onBar = Math.abs(boardState[barIdx] ?? 0) > 0;
    console.debug('[AITrace] difficulty=', effectiveDifficulty, 'dice=', dice, 'aiColor=', aiColor, 'onBar=', onBar);
  }

  try {
    if (!gameState || dice.length === 0) {
      return { moves: [] };
    }

    // ─── OPENING BOOK: L9-10 use the exact expert table (full two-die sequence) ───
    if (effectiveDifficulty >= 9) {
      const expert = getExpertOpeningSequence(dice, boardState, aiColor);
      if (expert) {
        if (import.meta.env.DEV) {
          console.debug('[AITrace] opening book (L9-10):', expert.map(m => m.from + '->' + m.to));
        }
        return { moves: expert };
      }
    }

    // ─── OPENING BOOK: expert opening moves in very early game (L7-8) ───
    if (effectiveDifficulty >= 7) {
      const bookMoves = getOpeningBook(dice, boardState, aiColor, effectiveDifficulty);
      if (bookMoves) {
        const allTurnSequences = generateAllTurnSequences(boardState, dice, aiColor, gameState.usedDice || []);
        const flatMoves = allTurnSequences.flat();
        const bonusPick = applyOpeningBonus(flatMoves, bookMoves, effectiveDifficulty);
        // BUGFIX (2026-08-01): bonusPick is chosen from the flattened moves of
        // ALL full-turn sequences, so it can be a move that is only legal AFTER
        // another move in the same sequence (e.g. 1->2 when black is on the bar).
        // Applying it as the FIRST move corrupts the board and produces a
        // one-die turn. Validate it against the live state before recursing.
        if (bonusPick && isValidMove(gameState, bonusPick).valid) {
          const remaining = [...dice];
          remaining.splice(remaining.indexOf(bonusPick.die), 1);
          if (remaining.length > 0) {
            const simState = { ...gameState, board: applyMove(boardState, bonusPick, aiColor), usedDice: [...(gameState.usedDice || []), bonusPick.die] } as GameState;
            const rest = await getGrandmasterMove(applyMove(boardState, bonusPick, aiColor), remaining, simState, effectiveDifficulty);
            if (rest?.moves?.length) return { moves: [bonusPick, ...rest.moves] };
          }
          return { moves: [bonusPick] };
        }
      }
    }

    // ─── MASTER LEVEL (Difficulty 7-10): Full Turn Sequence Search with Tactical Skills & Expectimax ───
    if (effectiveDifficulty >= 7) {
      const boardHash = hashBoard(boardState);

      // 1. Zobrist Cache Check — skip at L10 so strength always comes from live evaluation.
      if (effectiveDifficulty < 10) {
        try {
          const cached = await fetchEvaluation(boardHash);
          if (cached?.best_move) {
            if (import.meta.env.DEV) console.debug('[AITrace] Zobrist cache HIT');
            const validation = isValidMove(gameState, cached.best_move);
            if (validation.valid && dice.includes(cached.best_move.die)) {
              const cachedBoard = applyMove(boardState, cached.best_move, aiColor);
              const remainingDice = [...dice];
              remainingDice.splice(remainingDice.indexOf(cached.best_move.die), 1);
              
              // Generate turn for remaining dice
              if (remainingDice.length > 0) {
                const simState = { ...gameState, board: cachedBoard, usedDice: [...gameState.usedDice, cached.best_move.die] };
                const remResult = await getGrandmasterMove(cachedBoard, remainingDice, simState, effectiveDifficulty);
                if (remResult && remResult.moves) {
                  console.log("🧠 Zobrist Master Cache HIT! Executing cached master sequence.");
                  return { moves: [cached.best_move, ...remResult.moves] };
                }
              }
              return { moves: [cached.best_move] };
            }
          }
        } catch (err) {
          console.warn("Zobrist fetch warning:", err);
        }
      }

      // 2. Generate ALL Legal Full Turn Sequences (all dice combined)
      const allTurnSequences = generateAllTurnSequences(
        boardState,
        dice,
        aiColor,
        gameState.usedDice || []
      );

      if (allTurnSequences.length === 0 || (allTurnSequences.length === 1 && allTurnSequences[0]!.length === 0)) {
        // A2: never skip a legal turn — if the sequence generator produced nothing,
        // fall back to greedy play. If there truly are no legal moves the fallback
        // returns an empty array (a legitimate skip).
        const fallbackMoves = await pickGreedyFallback(boardState, dice, gameState, aiColor, effectiveDifficulty);
        if (import.meta.env.DEV && fallbackMoves.length > 0) {
          console.warn('[AITrace] fallback: empty sequence set; greedy fallback returned', fallbackMoves.length, 'move(s). dice=', dice);
        }
        return { moves: fallbackMoves };
      }
      if (allTurnSequences.length === 1) return { moves: allTurnSequences[0]! };

      const config = getAIConfig(effectiveDifficulty);
      const maxSequences = config.maxSequences > 0 ? config.maxSequences : allTurnSequences.length;
      const presorted = allTurnSequences
        .map(seq => {
          let simBoard = [...boardState];
          for (const m of seq) simBoard = applyMove(simBoard, m, aiColor);
          return { seq, quickScore: heuristicEvaluate(simBoard, aiColor, getDifficultyWeights(effectiveDifficulty).strategyIntensity) };
        })
        .sort((a, b) => b.quickScore - a.quickScore);

      const turnSequences = presorted.slice(0, maxSequences).map(p => p.seq);

      console.log(`🏆 AI Level ${effectiveDifficulty}: evaluating ${turnSequences.length}/${allTurnSequences.length} sequences`);

      // 3. Build Skill Context (incorporating SK-01 through SK-16)
      // REFORM (2026-08-03): when the reflective override is disabled the full
      // AnalysisAgent pipeline is skipped and skillCtx stays a bare context;
      // the pick is the base blend (see ENABLE_REFLECTIVE_OVERRIDE).
      let skillCtx: SkillContext = {
        state: gameState,
        aiColor,
        board: boardState,
        dice,
      };

      let bestSequence = turnSequences[0]!;
      let bestScore = -Infinity;
      // Per-candidate raw scores + optional skill deltas, consumed by
      // selectBestSequence after the loop (see BUGFIX 2026-08-03).
      const scoredCandidates: Array<{ score: number; delta: number | null }> = [];

      // Skills-based ranking helpers (L9-10 only). Skipped when the reflective
      // override is disabled (ENABLE_REFLECTIVE_OVERRIDE=false).
      let reflectivePlan: Array<{ skill: TacticalSkill; multiplier: number }> = [];
      if (ENABLE_REFLECTIVE_OVERRIDE && effectiveDifficulty >= 9) {
        try {
          skillCtx = await buildSkillContext({ state: gameState, aiColor, board: boardState, dice });
          reflectivePlan = (await import('../ai-worker/skills')).planForContext(skillCtx);
        } catch {
          reflectivePlan = [];
        }
      }

      // L9-10 helper: evaluate one candidate sequence with the active skill plan.
      // A3: the registered tactical skills (SK-07..SK-16) are actually invoked
      // (previously only the multipliers were summed — a no-op), plus a small set
      // of explicit deltas for rules the skills don't cover (most-backward checker
      // r4, unstacking r8, safe slotting / deny r7+r10).
      function scoreForSequenceBySkills(
        sequence: Array<{ from: number; to: number; die: number }>,
        boardAfter: number[],
        plan: Array<{ skill: TacticalSkill; multiplier: number }>,
        ctx: SkillContext,
      ): { valid: boolean; delta: number } {
        try {
          const aiColor = ctx.aiColor;
          const sign = aiColor === 'white' ? 1 : -1;
          const own = (v: number) => (sign > 0 && v > 0) || (sign < 0 && v < 0);
          let delta = 0;

          // Skill plan (rules 2, 3, 5, 6, 9 via SK-07/08/09/10/14/16).
          let simBoard = [...ctx.board];
          for (const move of sequence) {
            const moveCtx: SkillContext = { ...ctx, board: simBoard };
            for (const step of plan) {
              const skill = step.skill;
              if (skill.applies(move, moveCtx)) {
                delta += skill.score(move, moveCtx) * step.multiplier;
              }
            }
            simBoard = applyMove(simBoard, move, aiColor);
          }

          // r4: most-backward checker first (white 24 / black 1).
          const backOrigin = aiColor === 'white' ? 24 : 1;
          if (sequence.some(m => m.from === backOrigin)) delta += 0.4;

          // r8: prefer unstacking the 13/6 (white) / 12/19 (black) and avoid stacks >3.
          const unstackFrom = aiColor === 'white' ? [13, 6] : [12, 19];
          if (sequence.some(m => unstackFrom.includes(m.from))) delta += 0.3;
          for (let i = 1; i <= 24; i++) {
            const v = boardAfter[i] ?? 0;
            if (own(v) && Math.abs(v) > 3) delta -= 0.2 * (Math.abs(v) - 3);
          }

          // r7 + r10: safe slotting / deny the rival.
          delta += safeSlotDelta(sequence, boardAfter, aiColor);

          return { valid: true, delta };
        } catch {
          return { valid: false, delta: 0 };
        }
      }

      // A5: NN re-enabled at L9-10 (2026-08-01): self-learning pipeline (A+B+C)
      // trains weights via /model_weights.json. L7-8 kept their behaviour.
      if (import.meta.env.DEV && effectiveDifficulty >= 9) {
        console.debug('[AITrace] NN enabled at L9-10 (trained weights); blending with heuristic + reflective skill plan.');
      }

      for (const seq of turnSequences) {
        let simBoard = [...boardState];
        for (const m of seq) {
          simBoard = applyMove(simBoard, m, aiColor);
        }

        // Base evaluation: NN model prediction + heuristic.
        // (2026-08-01) NN re-enabled at all levels; falls back to heuristic-only
        // if the model is unavailable or evaluation throws.
        let nnScore = 0;
        let nnAvailable = true;
        if (nnAvailable) {
          try {
            nnScore = await nnModel.evaluate(simBoard, aiColor);
          } catch {
            nnScore = 0;
            nnAvailable = false;
          }
        }

        if (import.meta.env.DEV && !nnAvailable) {
          console.warn('[AITrace] NN unavailable; heuristic-only for this sequence.');
        }

        const heuristicScore = heuristicEvaluate(simBoard, aiColor, getDifficultyWeights(effectiveDifficulty).strategyIntensity);
        const masterWeights = getDifficultyWeights(effectiveDifficulty);
        const effectiveWeights = nnAvailable
          ? masterWeights
          : { nn: 0, heuristic: 1 };
        let score = (nnScore * 50 * effectiveWeights.nn) + (heuristicScore * effectiveWeights.heuristic);

        // At Level 7-10: Expectimax Chance node for opponent's response
        if (config.expectimaxDepth > 0) {
          const oppColor = aiColor === 'white' ? 'black' : 'white';
          const oppState: GameState = {
            ...gameState,
            board: simBoard,
            turn: oppColor,
            dice: [],
            usedDice: [],
          };
          // A2: if the chance node blows up for a sequence, degrade to the base
          // score instead of letting the whole turn fail (never skip a legal move).
          let expScore: number | null = null;
          try {
            expScore = await expectimaxChance(oppState, config.expectimaxDepth, aiColor);
          } catch {
            if (import.meta.env.DEV) {
              console.warn('[AITrace] expectimaxChance failed for a sequence; opponent weight skipped.');
            }
          }

          if (expScore !== null) {
            if (import.meta.env.DEV) {
              console.debug('[AITrace] seqScore?', false, 'seqLen=', seq.length, 'nnScore=', Number(((nnScore * 50 * masterWeights.nn)).toFixed?.(2) ?? nnScore * 50 * masterWeights.nn), 'heur=', Number((heuristicScore * masterWeights.heuristic).toFixed?.(2) ?? heuristicScore * masterWeights.heuristic), 'expScore=', Number(expScore.toFixed?.(2) ?? expScore), 'finalScore=', Number(score.toFixed?.(2) ?? score));
            }
            score = (score * (1 - config.oppWeight)) + (expScore * config.oppWeight);
          }
        } else {
          if (import.meta.env.DEV) {
            console.debug('[AITrace] seqScore?', false, 'seqLen=', seq.length, 'nnScore=', Number(((nnScore * 50 * masterWeights.nn)).toFixed?.(2) ?? nnScore * 50 * masterWeights.nn), 'heur=', Number((heuristicScore * masterWeights.heuristic).toFixed?.(2) ?? heuristicScore * masterWeights.heuristic), 'finalScore=', Number(score.toFixed?.(2) ?? score));
          }
        }

        // Noise control: L5-L7 get noise to simulate weaker play.
        if (config.noise > 0) {
          score += (Math.random() - 0.5) * config.noise;
        }

        // Reflective override (L9-10): collect each candidate's raw score and its
        // skill delta (null when skills are off/invalid); selectBestSequence runs
        // the reflect-vs-base comparison after the loop. BUGFIX (2026-08-03):
        // the comparison must not double-count the best candidate's delta — it
        // now lives in one place (selectBestSequence).
        let skillDeltaValue: number | null = null;
        if (ENABLE_REFLECTIVE_OVERRIDE && effectiveDifficulty >= 9 && reflectivePlan.length > 0) {
          const seqDelta = scoreForSequenceBySkills(seq, simBoard, reflectivePlan, skillCtx);
          if (seqDelta.valid) skillDeltaValue = seqDelta.delta;
        }
        scoredCandidates.push({ score, delta: skillDeltaValue });
      }

      // Pick the winner (reflect-vs-base, single delta application).
      {
        const { index: bestIndex, effectiveScore } = selectBestSequence(scoredCandidates);
        bestSequence = turnSequences[bestIndex]!;
        bestScore = effectiveScore;
      }

      // Store best master move in Zobrist cache for future instant hits
      if (bestSequence.length > 0) {
        if (import.meta.env.DEV) {
          console.debug('[AITrace] selected sequence=', bestSequence.map(m => m.from + '->' + m.to), 'bestScore=', Number(bestScore.toFixed?.(2) ?? bestScore));
        }
        storeEvaluation(boardHash, {
          best_move: bestSequence[0]!,
          equity: bestScore / 100,
          depth: config.expectimaxDepth,
        }).catch((err) => console.warn("🧠 Master Zobrist Sync Warning:", err));
      }

      if (import.meta.env.DEV) {
        console.log(`[AITrace] AI Level ${effectiveDifficulty} picked sequence of ${bestSequence.length} moves with score ${Number(bestScore.toFixed?.(2) ?? bestScore)}`);
      }
      // ─── DEV DIAGNOSTIC: only in development for difficulty 9-10 ───
      if (import.meta.env.DEV && effectiveDifficulty >= 9) {
        const bearOffSequences = allTurnSequences.filter(seq =>
          seq.some(m => m.to === (aiColor === 'white' ? OFF_WHITE : OFF_BLACK))
        );
        console.log('[AITrace-DIAG]', {
          allCount: allTurnSequences.length,
          evaluatedCount: turnSequences.length,
          bearOffCount: bearOffSequences.length,
          hasBearOff: bearOffSequences.length > 0,
          bestSeqHasBearOff: bestSequence.some(m => m.to === (aiColor === 'white' ? OFF_WHITE : OFF_BLACK)),
          bestScore,
        });
      }
      // ─── END DIAGNOSTIC ───

      if (bestSequence.length === 0) {
        // A2: master search picked nothing — fall back to greedy so a legal turn
        // is never skipped. (Only a true absence of legal moves returns empty.)
        const fallbackMoves = await pickGreedyFallback(boardState, dice, gameState, aiColor, effectiveDifficulty);
        if (import.meta.env.DEV && fallbackMoves.length > 0) {
          console.warn('[AITrace] fallback: master search empty; greedy fallback returned', fallbackMoves.length, 'move(s). dice=', dice);
        }
        return { moves: fallbackMoves };
      }
      return { moves: bestSequence };
    }

    // ─── STANDARD/BEGINNER LEVEL (Difficulty 1-7): Step-by-step greedy search ───
    const finalMoves: { from: number; to: number; die: number }[] = [];
    const availableDice = [...dice];
    let simBoard = [...boardState];

    while (availableDice.length > 0) {
      const simUsedDice = [...gameState.usedDice, ...finalMoves.map((m) => m.die)];
      const simState = { ...gameState, board: simBoard, usedDice: simUsedDice } as GameState;
      const legalMoves = getValidMoves(simState);
      if (legalMoves.length === 0) break;

      const picked = await pickBestMove(legalMoves, availableDice, simBoard, aiColor, effectiveDifficulty);
      if (!picked) break;

      availableDice.splice(availableDice.indexOf(picked.die), 1);
      finalMoves.push({ from: picked.from, to: picked.to, die: picked.die });
      simBoard = applyMove(simBoard, picked, aiColor);
    }

    return { moves: finalMoves };
  } catch (error) {
    console.error("AI Logic Failed:", error);
    return null;
  }
}

/** Fetch the last 5 AI evaluations from Supabase for short-term memory */
export async function getRecentGameContext(gameId: string): Promise<string> {
  if (!gameId || gameId === '00000000-0000-0000-0000-000000000000') return '';
  try {
    const { data, error } = await supabase
      .from('game_history_analysis')
      .select('ai_evaluation, tension_metric, turn_number')
      .eq('game_id', gameId)
      .order('turn_number', { ascending: false })
      .limit(5);

    if (error || !data || data.length === 0) return '';
    return data.reverse().map((row: { turn_number: number; ai_evaluation: string; tension_metric: number }) =>
      `Turno ${row.turn_number} [Tensión: ${row.tension_metric}]: ${row.ai_evaluation}`
    ).join('\n');
  } catch {
    return '';
  }
}

/** Call Gemini to generate a contextual taunt based on game events */
export async function generateGeminiTaunt(
  eventType: 'hit' | 'double' | 'thinking' | 'roll' | 'skip' | 'win' | 'lose',
  gameContext: {
    game_id?: string;
    summary?: string;
    tension?: string;
    cubeValue: number;
    playerPoints: number;
    aiPoints: number;
    dice?: number[];
    isBlunder?: boolean;
  }
): Promise<string | null> {
  const eventDescriptions: Record<string, string> = {
    hit: "Has capturado una ficha del oponente ('hit').",
    double: "El oponente ha propuesto doblar el cubo y tú has aceptado.",
    thinking: "Es tu turno de jugar y estás analizando la posición estratégica.",
    roll: "Acabas de tirar los dados.",
    skip: "No tienes movimientos legales disponibles en este turno ('skip').",
    win: "¡Acabas de derrotar al jugador!",
    lose: "Has perdido miserablemente la partida."
  };

  const contextStr = "Cubo: " + gameContext.cubeValue + "x, Puntos jugador: " + gameContext.playerPoints + ", Puntos IA: " + gameContext.aiPoints;
  const boardContextStr = gameContext.summary ? `[Contexto del Tablero: ${gameContext.summary}]\n` : '';

  let memoryContextStr = '';
  if (gameContext.game_id) {
    const memory = await getRecentGameContext(gameContext.game_id);
    if (memory) memoryContextStr = `[Memoria Reciente:\n${memory}]\n`;
  }

  const prompt = `
    Eres 'El Gran Maestro', la IA de Backgammon sarcástica.
    ${boardContextStr}${memoryContextStr}
    Evento: ${eventDescriptions[eventType]} | Detalles: ${contextStr}
    SÉ BREVE (15 PALABRAS MÁX). Genera solo el comentario sarcástico.
  `;

  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return (typeof text === 'string' && !text.includes("error")) ? text : null;
  } catch {
    return null;
  }
}

/** Local offline fallback for the equity bar when the daily Gemini quota is
 * exhausted: evaluate the current position with the heuristic expectimax value
 * function (already used for AI moves), mapped into the -100..100 equity range. */
function localEvaluationFallback(state?: GameState): number {
  if (!state?.board?.length) return 0;
  const turn = state.turn === 'white' ? 'white' : state.turn === 'black' ? 'black' : 'black';
  const raw = heuristicEvaluate([...state.board], turn, 1.5);
  return Math.max(-100, Math.min(100, Math.round(raw)));
}

/** Send board summary to Gemini to get an Equity Score (-100 to 100) and analysis.
 *  If Gemini is unavailable (e.g. daily quota exhausted) it returns a local
 *  heuristic estimate so the equity bar keeps working in offline AI mode. */
export async function generateEvaluationScore(
  summary: string,
  tension: string,
  gameState?: GameState
): Promise<{ evaluation: string, score: number }> {
  const prompt = `Analiza nivel Gran Maestro: ${summary} (Tensión: ${tension}). Devuelve resultado breve y termina con [SCORE: X] (-100 a 100).`;
  try {
    const rawText = await callGeminiProxy(prompt, 'analysis');
    if (!rawText || typeof rawText !== 'string' || rawText.includes("error")) {
      const offlineScore = localEvaluationFallback(gameState);
      return { evaluation: summary, score: offlineScore };
    }
    const scoreMatch = rawText.match(/\[SCORE:\s*(-?\d+)\]/i);
    const score = (scoreMatch && scoreMatch[1]) ? parseInt(scoreMatch[1], 10) : 0;
    const evaluationText = rawText.replace(/\[SCORE:\s*-?\d+\]/i, '').trim();
    return { evaluation: evaluationText, score };
  } catch {
    const offlineScore = localEvaluationFallback(gameState);
    return { evaluation: summary, score: offlineScore };
  }
}

/** Generate an epic closing taunt based on long-term memory of the game */
export async function generateGameSummary(gameId: string | undefined, winner: string, winMethod: string): Promise<string | null> {
  const memory = gameId ? await getRecentGameContext(gameId) : '';
  const prompt = `Final de partida. Ganó: ${winner} por ${winMethod}. Memoria: ${memory}. Di algo épico (30 palabras máx).`;
  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

/** Log game results for training feedback loop */
export async function logGameResult(gameId: string, winner: string, winMethod: string, finalBoard: number[], aiColor: 'white' | 'black') {
  try {
    await supabase.from('ai_training_feedback').insert({
      game_id: gameId,
      winner,
      win_method: winMethod,
      ai_won: winner === aiColor,
      ai_color: aiColor,
      metadata: { final_board: finalBoard, timestamp: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Logging failed:', err);
  }
}

/**
 * Translate internal indices to natural language visual coordinates.
 * - Handles 1-24 mirroring for Black.
 * - Converts Bar (26/27) and Off (28/29) to friendly text.
 */
function translateToVisualCoord(coord: number, perspectiveColor: 'white' | 'black'): string {
  if (coord === 26 || coord === 27) return "Barra";
  if (coord === 28 || coord === 29) return "Fuera";

  let visualId = coord;
  // Mirror if and only if the perspective is Black (which has a mirrored board in UI)
  if (perspectiveColor === 'black' && coord >= 1 && coord <= 24) {
    visualId = 25 - coord;
  }

  return `punto ${visualId}`;
}

/** Explain logical move to a child (active player commentary) */
export async function generatePedagogicalCommentary(
  moves: { from: number; to: number; die: number }[],
  _boardState: number[],
  moverColor: 'white' | 'black',
  perspectiveColor: 'white' | 'black', // The color the human sees (controls mirroring)
  playerScore: number,
  aiScore: number
): Promise<string | null> {
  if (!moves || moves.length === 0) return null;

  const movesDesc = moves.map(m =>
    `de mi ${translateToVisualCoord(m.from, perspectiveColor)} al ${translateToVisualCoord(m.to, perspectiveColor)}`
  ).join(', ');

  const positionContext = [
    formatPositionSummary({
      board: _boardState.length ? _boardState : new Array(30).fill(0),
      turn: moverColor,
      dice: [],
      usedDice: [],
      cube: 1,
      cubeOwner: null,
      crawford: false,
      matchScore: { white: 0, black: 0 },
      winner: null,
    } as GameState, perspectiveColor),
    formatLegalMovesSummary({
      board: _boardState.length ? _boardState : new Array(30).fill(0),
      turn: moverColor,
      dice: [],
      usedDice: [],
      cube: 1,
      cubeOwner: null,
      crawford: false,
      matchScore: { white: 0, black: 0 },
      winner: null,
    } as GameState, perspectiveColor),
  ].join('\n');

  const prompt = `Eres un tutor de Backgammon simpático (Profesor Mágico). Estás comentando tu propio turno (eres la IA y juegas con ${moverColor}).
  Le hablas a un niño principiante que juega con fichas de color ${perspectiveColor}.
  Puntuación - Niño: ${playerScore}, El Profesor: ${aiScore}.
  Contexto del tablero:
  ${positionContext}
  He movido mis fichas ${moverColor} así: ${movesDesc}.
  Explica brevemente por qué fue un buen movimiento de forma educativa para que el niño aprenda, usando un lenguaje muy sencillo y humano (25 palabras máx, emojis).
  IMPORTANTE: Refiérete a los puntos por los números que te he dado (${movesDesc}), que son los que el niño ve en SU pantalla.`;

  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return (typeof text === 'string' && !text.includes("error")) ? text : null;
  } catch {
    return null;
  }
}

/** Generate a pedagogical hint for the human player (Modo Pista) */
export async function generatePedagogicalHint(
  boardState: number[],
  dice: number[],
  gameState: GameState,
  playerColor: 'white' | 'black'
): Promise<string | null> {
  try {
    const finalMoves: { from: number; to: number; die: number }[] = [];
    const availableDice = [...dice];
    let simBoard = [...boardState];

    while (availableDice.length > 0) {
      const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
      const simState = { ...gameState, board: simBoard, usedDice: simUsedDice, turn: playerColor };
      const legalMoves = getValidMoves(simState);
      if (legalMoves.length === 0) break;

      const picked = await pickBestMove(legalMoves, availableDice, simBoard, playerColor);
      if (!picked) break;

      availableDice.splice(availableDice.indexOf(picked.die), 1);
      finalMoves.push(picked);
      simBoard = applyMove(simBoard, picked, playerColor);
    }

    if (finalMoves.length === 0) return "¡Parece que no tienes movimientos legales! 😅";

    // Perspective for hints is always the player's color
    const movesDesc = finalMoves.map(m =>
      `tus fichas de color ${playerColor === 'white' ? 'Blanco' : 'Rojo'} del ${translateToVisualCoord(m.from, playerColor)} al ${translateToVisualCoord(m.to, playerColor)}`
    ).join(', ');

    const prompt = `Eres un tutor de Backgammon simpático (Profesor Mágico). Estás enseñando a un niño principiante que juega con fichas ${playerColor === 'white' ? 'Blancas' : 'Rojas'}.
    Sus dados son ${dice.join(' y ')}. RECOMIÉNDALE estos movimientos: ${movesDesc}.
    Explícale por qué son buenos de forma muy humana y sencilla, sin usar tecnicismos de IA (MÁX 25 PALABRAS, emojis).
    IMPORTANTE: Refiérete a los puntos por los números que te he dado (${movesDesc}), que son los que el niño ve en SU pantalla.`;

    const text = await callGeminiProxy(prompt, 'moves');
    if (typeof text === 'string' && !text.includes("error")) {
      return text;
    }

    // Safety fallback: Give the logical advice without the "Magic" fluff if Gemini fails
    return `Mueve ${movesDesc}. ¡Tú puedes! 🎲`;
  } catch (err) {
    console.error('Hint Failed:', err);
    return "¡Intenta mover hacia tu casa! 🏠";
  }
}
