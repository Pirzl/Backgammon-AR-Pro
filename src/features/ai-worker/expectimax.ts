/**
 * Expectimax Search for Backgammon AI
 * Depth-2 game tree search with chance nodes for dice rolls
 *
 * NOTE: all returned values are clamped to [-50, 50] so they are
 * directly comparable with the NN/heuristic evaluation scale used
 * elsewhere (also [-50, 50]).
 *
 * Algorithm:
 * MAX (AI) → CHANCE (dice roll) → MIN (opponent) → CHANCE → Heuristic
 */

import type { GameState, Move, PlayerColor } from '../../entities/game/types';
import { getValidMoves, applyMove, getHomeBoard, getBarIndex, getOffIndex, getDirection, allCheckersHome } from '../../entities/game/rules';

const EXPECTIMAX_MAX = 50;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > EXPECTIMAX_MAX) return EXPECTIMAX_MAX;
  if (value < -EXPECTIMAX_MAX) return -EXPECTIMAX_MAX;
  return value;
}

// -----------------------------------------------------------
// 2. PESOS INICIALES RECOMENDADOS (Tuned for Strategic Play)
// -----------------------------------------------------------
const WEIGHTS = {
  pipCount: -0.6,
  prime: 1.2,
  anchor: 0.9,
  blotRisk: 2.8,
  boardStrength: 0.8,
  homeBoard: 0.7,
  raceMode: 1.2,
  hitBonus: 1.2,
  bearOff: 2.2,
  contactBearOff: 1.4,
};

/**
 * Get best move for current player using Expectimax search
 * 
 * @param state - Current game state
 * @param depth - Search depth (default: 2)
 * @returns Best move and its expected value
 */
export async function getBestMove(
  state: GameState,
  depth: number = 2
): Promise<{ move: Move | null; value: number }> {
  const validMoves = getValidMoves(state);
  
  if (validMoves.length === 0) {
    // If no moves, return null (pass turn)
    // Evaluate current static position
    const value = evaluatePosition(state.board, state.turn);
    return { move: null, value };
  }
  
  if (validMoves.length === 1) {
    // Only one move - no need to evaluate
    return { move: validMoves[0]!, value: 0 };
  }
  
  let bestMove = validMoves[0]!;
  let bestValue = -Infinity;
  
  for (const move of validMoves) {
    // Apply move
    const newBoard = applyMove(state.board, move, state.turn);
    const newState: GameState = {
      ...state,
      board: newBoard,
      usedDice: [...state.usedDice, move.die],
    };
    
    // Evaluate this branch
    const value = await expectimaxChance(newState, depth - 1, state.turn);

    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }
  
  return { move: bestMove, value: bestValue };
}

/**
 * CHANCE node: Calculate expected value over all possible dice rolls
 * OPTIMIZED: Parallel evaluation of all dice combinations
 */
export async function expectimaxChance(
  state: GameState,
  depth: number,
  aiPlayer: PlayerColor
): Promise<number> {
  if (depth <= 0) {
    return clampScore(evaluatePosition(state.board, aiPlayer));
  }

  // All possible dice combinations
  const diceCombinations = getAllDiceCombinations();
  
  // Sequential evaluation to avoid Promise.all explosion on deep chance nodes
  let expectedValue = 0;
  for (const { dice, probability } of diceCombinations) {
    const newState: GameState = {
      ...state,
      dice,
      usedDice: [],
      turn: state.turn === 'white' ? 'black' : 'white',
    };

    const value = clampScore(await expectimaxMin(newState, depth - 1, aiPlayer));
    expectedValue += value * probability;
  }

  return clampScore(expectedValue);
}

/**
 * MIN node: Choose move that minimizes value for opponent
 */
async function expectimaxMin(
  state: GameState,
  depth: number,
  aiPlayer: PlayerColor
): Promise<number> {
  const validMoves = getValidMoves(state);
  
  if (validMoves.length === 0 || depth <= 0) {
    return evaluatePosition(state.board, aiPlayer);
  }
  
  let minValue = Infinity;
  
  for (const move of validMoves) {
    const newBoard = applyMove(state.board, move, state.turn);
    const newState: GameState = {
      ...state,
      board: newBoard,
      usedDice: [...state.usedDice, move.die],
    };
    
    const value = await expectimaxChance(newState, depth - 1, aiPlayer);
    minValue = Math.min(minValue, value);
  }
  
  return clampScore(minValue);
}

// -----------------------------------------------------------
// 3. GAME PLAN & HEURISTIC LAYER
// -----------------------------------------------------------

type GamePlan = 'race' | 'prime' | 'attack' | 'holding' | 'blitz' | 'backgame' | 'mixed';

/**
 * Strategic plan detection for high difficulty play.
 */
function getGamePlan(board: number[], player: PlayerColor): GamePlan {
  if (isRaceMode(board)) return 'race';

  const oppPlayer = player === 'white' ? 'black' : 'white';
  const primeScore = calculatePrimeScore(board, player);
  const oppPrimeScore = calculatePrimeScore(board, oppPlayer);
  const myAnchors = calculateAnchorScore(board, player);
  const oppAnchors = calculateAnchorScore(board, oppPlayer);
  const myHomeStrength = evaluateHomeBoard(board, player);

  const oppBarIndex = getBarIndex(oppPlayer);
  const oppOnBar = Math.abs(board[oppBarIndex] ?? 0) > 0;

  const hasStrongPrime = primeScore >= 1.5;
  const hasGoodAnchors = myAnchors >= 1.0;

  if (oppOnBar && myHomeStrength >= 3) return 'blitz';
  if (hasStrongPrime && oppPrimeScore < primeScore) return 'prime';
  if (hasGoodAnchors && oppAnchors < myAnchors) return 'holding';

  const deepAnchors = countDeepAnchors(board, player);
  const opponentFarAhead = calculatePipDiff(board, player) > 40;
  if (deepAnchors >= 2 && opponentFarAhead) return 'backgame';

  return 'mixed';
}

function countDeepAnchors(board: number[], player: PlayerColor): number {
  const [oppHomeStart, oppHomeEnd] = getHomeBoard(player === 'white' ? 'black' : 'white');
  const sign = player === 'white' ? 1 : -1;
  let count = 0;
  for (let i = oppHomeStart; i <= oppHomeEnd; i++) {
    const checkers = board[i] ?? 0;
    if ((sign > 0 && checkers >= 2) || (sign < 0 && checkers <= -2)) {
      count++;
    }
  }
  return count;
}

/**
 * Count how many opponent checkers are effectively trapped
 * behind our prime (from our perspective).
 *
 * This is an approximation: we only look up to 6 points ahead
 * of each opposing checker and require at least a 3-point wall.
 */
function countTrappedCheckers(board: number[], player: PlayerColor): number {
  const oppPlayer = player === 'white' ? 'black' : 'white';
  const sign = oppPlayer === 'white' ? 1 : -1;
  const direction = getDirection(oppPlayer); // movement direction of the opponent

  let trapped = 0;

  for (let point = 1; point <= 24; point++) {
    const checkers = board[point] ?? 0;
    const isOppHere = (sign > 0 && checkers > 0) || (sign < 0 && checkers < 0);
    if (!isOppHere) continue;

    // Look up to 6 pips ahead of this opposing checker
    let consecutiveWall = 0;
    for (let step = 1; step <= 6; step++) {
      const ahead = point + step * direction;
      if (ahead < 1 || ahead > 24) break;
      const aheadCheckers = board[ahead] ?? 0;
      const isOurPoint =
        (player === 'white' && aheadCheckers >= 2) ||
        (player === 'black' && aheadCheckers <= -2);

      if (isOurPoint) {
        consecutiveWall++;
      } else {
        break;
      }
    }

    if (consecutiveWall >= 3) {
      trapped += Math.abs(checkers);
    }
  }

  return trapped;
}

// -----------------------------------------------------------
// 4. evaluatePosition (Static heuristic)
// -----------------------------------------------------------

/**
 * Static position evaluation (heuristic)
 * Returns value from AI player's perspective (-100 = loss, +100 = win)
 * NOTE: This is now a sync wrapper, but the NN evaluation is preferred if possible.
 */
export function evaluatePosition(board: number[], aiPlayer: PlayerColor, strategyIntensity = 1): number {
  const oppPlayer = aiPlayer === 'white' ? 'black' : 'white';
  const sign = aiPlayer === 'white' ? 1 : -1;
  
  // 6. Win/loss check (terminal states) - Heavily weighted
  const aiOffIndex = getOffIndex(aiPlayer);
  const oppOffIndex = getOffIndex(oppPlayer);
  const aiBornOff = Math.abs(board[aiOffIndex] ?? 0);
  const oppBornOff = Math.abs(board[oppOffIndex] ?? 0);
  
  if (aiBornOff === 15) return 100.0;
  if (oppBornOff === 15) return -100.0;

  // Pre-calc pip diff for all phases
  const pipDiff = calculatePipDiff(board, aiPlayer);

  // Check if we are effectively in bear‑off phase (all our checkers are home)
  const aiAllHome = allCheckersHome(board, aiPlayer);

  // D) RACE MODE CHECK
  // If there is no contact possible (all AI checkers are ahead of all Opponent checkers),
  // switch to race-oriented evaluation with a strong preference for actually bearing off.
  if (isRaceMode(board)) {
      let score = 0;

      // Pip count still matters in a race
      score += pipDiff * WEIGHTS.pipCount * WEIGHTS.raceMode * 0.1;

      // Strong direct reward for borne-off checkers.
      // If all our checkers are home, we are in pure bear‑off phase,
      // so we push even harder to take checkers off instead of just shuffling inside home.
      const bearOffWeight = aiAllHome ? WEIGHTS.bearOff * 2 : WEIGHTS.bearOff;
      score += (aiBornOff - oppBornOff) * bearOffWeight;

      // Clamp in same range as non-race path
      return clampScore(score);
  }

  const intensity = Math.min(Math.max(strategyIntensity, 1), 2);

  let score = 0;

  // Determine broad strategic plan to slightly adjust weights
  const gamePlan = getGamePlan(board, aiPlayer);

  let pipWeight = WEIGHTS.pipCount * 0.05;
  let primeWeight = WEIGHTS.prime * intensity;
  let anchorWeight = WEIGHTS.anchor * intensity;
  let blotRiskWeight = WEIGHTS.blotRisk * intensity;
  let hitMultiplier = 1.0;

  if (gamePlan === 'prime') {
    primeWeight *= 1.4;
    pipWeight *= 0.7;
  } else if (gamePlan === 'attack' || gamePlan === 'blitz') {
    hitMultiplier = gamePlan === 'blitz' ? 1.7 : 1.4;
    blotRiskWeight *= 0.8;
  } else if (gamePlan === 'holding') {
    anchorWeight *= 1.4;
  } else if (gamePlan === 'backgame') {
    anchorWeight *= 1.6;
    blotRiskWeight *= 0.6;
    hitMultiplier = 1.6;
  }

   // Direct bar penalties/rewards: being on the bar is very bad,
   // sending the opponent to the bar is good. This makes the AI
   // much more sensitive to risky blots and missed hits.
   const myBarIndex = getBarIndex(aiPlayer);
   const oppBarIndex = getBarIndex(oppPlayer);
   const myBarCount = Math.abs(board[myBarIndex] ?? 0);
   const oppBarCount = Math.abs(board[oppBarIndex] ?? 0);

   if (myBarCount > 0) {
     const oppHomeStrength = evaluateHomeBoard(board, oppPlayer);
     score -= myBarCount * (3 + oppHomeStrength);
   }

   if (oppBarCount > 0) {
     const myHomeStrength = evaluateHomeBoard(board, aiPlayer);
     score += oppBarCount * (1.5 + myHomeStrength * 0.5);
   }

  // 1. Pip Count Score
  score += pipDiff * pipWeight;

  // 1b. Pip momentum in contact mode. The base pipWeight (0.03) is nearly
  // negligible, so positional bonuses (prime/anchor/made-points) can dominate
  // and overvalue positions where we are far behind in the race. In contact,
  // being behind by many pips is bad: the opponent is escaping. Add a clear
  // pip-deficit signal here (verified by replay analysis: the heuristic gave
  // +11.4 to a contact move expectimax evaluated at -3.3).
  if (!isRaceMode(board)) {
    score -= pipDiff * 0.10 * intensity;
  }

  // 2. Prime Score (Building Walls)
  const primeScore = calculatePrimeScore(board, aiPlayer);
  const oppPrimeScore = calculatePrimeScore(board, oppPlayer);
  score += (primeScore - oppPrimeScore) * primeWeight;

  // 3. Anchor Score (Safety in opponent home)
  const anchorScore = calculateAnchorScore(board, aiPlayer);
  const oppAnchorScore = calculateAnchorScore(board, oppPlayer); 
  score += (anchorScore - oppAnchorScore) * anchorWeight;
  
  // 4. Blot Risk (Safety)
  // Negative score for us (risk), positive if opponent has risk
  const myRisk = calculateBlotRisk(board, aiPlayer);
  const oppRisk = calculateBlotRisk(board, oppPlayer);
  score -= myRisk * blotRiskWeight;
  score += oppRisk * blotRiskWeight; // Good if opponent is at risk
  
  // 5. Trapped opponent checkers behind our primes
  const trappedOpp = countTrappedCheckers(board, aiPlayer);
  if (trappedOpp > 0) {
    score += trappedOpp * 0.4; // modest but meaningful bonus per trapped checker
  }
  
  // 6. Conditional Hit Bonus (Capturing)
  const hitBonus = calculateConditionalHitBonus(board, aiPlayer) * hitMultiplier;
  score += hitBonus;

  // 7. Board Strength (Home board points made)
  const aiStrength = evaluateHomeBoard(board, aiPlayer);
  const oppStrength = evaluateHomeBoard(board, oppPlayer);
  score += (aiStrength - oppStrength) * WEIGHTS.boardStrength;

  // 7b. Point-5 preference: in early/middle game, making or owning point 5 is valuable.
  const point5 = board[5] ?? 0;
  const ownsPoint5 = (aiPlayer === 'white' && point5 >= 2) || (aiPlayer === 'black' && point5 <= -2);
  if (ownsPoint5) score += 1.1;

  // 7c. Anti-stacking diversification: avoid stacking >3 checkers on one point.
  for (let i = 1; i <= 24; i++) {
    const v = board[i] ?? 0;
    const ours = (aiPlayer === 'white' && v > 0) || (aiPlayer === 'black' && v < 0);
    if (ours && Math.abs(v) > 3) score -= 0.3 * (Math.abs(v) - 3);
  }

  // 7d. Strategy Matrix positional bonuses (difficulty-scaled):
  // - make strong inner points early: 5 for white / 20 for black
  // - make 7-point / bar-point anchors
  // - avoid stacking back checkers on the 24pt/1pt
  if (strategyIntensity > 0) {
    const strongInner = aiPlayer === 'white' ? 5 : 20;
    const strongOuter = aiPlayer === 'white' ? 7 : 18;
    const homeStart = aiPlayer === 'white' ? 1 : 19;
    const homeEnd = aiPlayer === 'white' ? 6 : 24;

    // Reward strong points in opponent home / inner board
    const strongInnerCount = board[strongInner] ?? 0;
    const ownsStrongInner = (sign > 0 && strongInnerCount >= 2) || (sign < 0 && strongInnerCount <= -2);
    if (ownsStrongInner) score += 1.6 * intensity;

    const strongOuterCount = board[strongOuter] ?? 0;
    const ownsStrongOuter = (sign > 0 && strongOuterCount >= 2) || (sign < 0 && strongOuterCount <= -2);
    if (ownsStrongOuter) score += 1.2 * intensity;

    // Reward having anchors in opponent home
    let anchors = 0;
    for (let i = homeStart; i <= homeEnd; i++) {
      const v = board[i] ?? 0;
      if ((sign > 0 && v >= 2) || (sign < 0 && v <= -2)) anchors++;
    }
    if (anchors >= 2) score += 0.9 * intensity;

    // Penalty for stacking all back checkers on point 24/1
    const backPoint = aiPlayer === 'white' ? 24 : 1;
    const backStack = Math.abs(board[backPoint] ?? 0);
    if (backStack >= 4) score -= 0.6 * intensity;

    // Bonus for split back checkers (not stacked)
    const splitter = aiPlayer === 'white' ? 23 : 2;
    const splitCount = board[splitter] ?? 0;
    const hasSplitter = (sign > 0 && splitCount >= 2) || (sign < 0 && splitCount <= -2);
    if (hasSplitter) score += 0.5 * intensity;
  }

  // 7e. Made-points / consolidation bonus (reward 2+ checkers on a point) and
  // lone-blot penalty (contact positions). Helps break heuristic saturation in
  // lost endgames where pip/born-off terms dominate and blotRisk/prime are 0.
  if (!isRaceMode(board)) {
    let madePoints = 0;
    let exposedBlots = 0;
    for (let i = 1; i <= 24; i++) {
      const v = board[i] ?? 0;
      if ((sign > 0 && v >= 2) || (sign < 0 && v <= -2)) madePoints++;
      else if ((sign > 0 && v === 1) || (sign < 0 && v === -1)) exposedBlots++;
    }
    score += madePoints * 0.3 * intensity;
    score -= exposedBlots * 0.12 * intensity;
  }

  // 8. Bearing-off bonus even before pure race mode.
  if (aiAllHome || aiBornOff > oppBornOff) {
    score += (aiBornOff - oppBornOff) * WEIGHTS.contactBearOff;
  }

  // Helper bonus for bearing off
  score += (aiBornOff - oppBornOff) * 0.5;

  // Clamp to avoid Infinity issues in minimax, but allow distinct winning values
  return Math.max(-50, Math.min(50, score));
}

// -----------------------------------------------------------
// A) calculatePrimeScore
// -----------------------------------------------------------
export function calculatePrimeScore(board: number[], player: PlayerColor): number {
  const sign = player === 'white' ? 1 : -1;
  // Primes usually relevant on board points 1-24
  let score = 0;
  let consecutive = 0;
  
  // Iterate all points
  for (let i = 1; i <= 24; i++) {
    const checkers = board[i] ?? 0;
    const isPlayerPoint = (sign > 0 && checkers >= 2) || (sign < 0 && checkers <= -2);
    
    if (isPlayerPoint) {
      consecutive++;
    } else {
      // End of sequence, score it
      if (consecutive >= 3) {
          // Bonus increases non-linearly
          if (consecutive === 3) score += 0.5;
          else if (consecutive === 4) score += 1.2;
          else if (consecutive === 5) score += 2.0;
          else if (consecutive >= 6) score += 4.0;
      }
      consecutive = 0;
    }
  }
  // Check final sequence
  if (consecutive >= 3) {
      if (consecutive === 3) score += 0.5;
      else if (consecutive === 4) score += 1.2;
      else if (consecutive === 5) score += 2.0;
      else if (consecutive >= 6) score += 4.0;
  }
  
  return score;
}

// -----------------------------------------------------------
// B) calculateAnchorScore
// -----------------------------------------------------------
export function calculateAnchorScore(board: number[], player: PlayerColor): number {
  let score = 0;
  const sign = player === 'white' ? 1 : -1;
  const oppPlayer = player === 'white' ? 'black' : 'white';
  
  // Opponent Home Board logic
  // White (24->1). Opponent (Black) Home: 19-24.
  // Black (1->24). Opponent (White) Home: 1-6.
  
  const [oppHomeStart, oppHomeEnd] = getHomeBoard(oppPlayer);
  
  for (let i = oppHomeStart; i <= oppHomeEnd; i++) {
     const checkers = board[i] ?? 0;
     const isAnchor = (sign > 0 && checkers >= 2) || (sign < 0 && checkers <= -2);
     
     if (isAnchor) {
         // Calculate distance relative to "start" (24 for White, 1 for Black)
         // Point 20 (White) -> Distance 20.
         // Point 5 (Black) -> Distance 20. (25-5)
         const distance = player === 'white' ? i : (25 - i);
         
         // Golden Point (20) -> Score 1.2
         // Bar Point (18) / 7 ?? No, anchors are deep.
         // 24-point (Deepest) -> Score 0.2
         
         if (distance === 20) score += 1.2; // Golden Anchor
         if (distance === 21) score += 1.0;
         if (distance === 22) score += 0.7;
         if (distance === 23) score += 0.4;
         if (distance === 24) score += 0.2;
     }
  }
  return score;
}

// -----------------------------------------------------------
// C) calculateBlotRisk
// -----------------------------------------------------------
export function calculateBlotRisk(board: number[], player: PlayerColor): number {
  let score = 0;
  const sign = player === 'white' ? 1 : -1;
  const oppPlayer = player === 'white' ? 'black' : 'white';
  const oppDirection = getDirection(oppPlayer);

  for (let i = 1; i <= 24; i++) {
     const checkers = board[i] ?? 0;
     if ((sign > 0 && checkers === 1) || (sign < 0 && checkers === -1)) {
         for (let pip = 1; pip <= 6; pip++) {
             const threatIndex = i - oppDirection * pip;
             
             if (threatIndex >= 1 && threatIndex <= 24) {
                 const oppCheckers = board[threatIndex] ?? 0;
                 if ((sign > 0 && oppCheckers < 0) || (sign < 0 && oppCheckers > 0)) {
                    score += (0.3 + (6 - pip) * 0.1);
                 }
             }
         }

         const oppBarIndex = getBarIndex(oppPlayer);
         const oppBarCount = Math.abs(board[oppBarIndex] ?? 0);
         
         if (oppBarCount > 0) {
             if (player === 'white' && i >= 1 && i <= 6) {
                  score += 0.5;
             }
             if (player === 'black' && i >= 19 && i <= 24) {
                  score += 0.5;
             }
         }
     }
  }
  return score;
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function evaluateHomeBoard(board: number[], player: PlayerColor): number {
  const [start, end] = getHomeBoard(player);
  let points = 0;
  const sign = player === 'white' ? 1 : -1;
  
  for (let i = start; i <= end; i++) {
     const checkers = board[i] ?? 0;
     if ((sign > 0 && checkers >= 2) || (sign < 0 && checkers <= -2)) {
         points++;
     }
  }
  return points; // 0 to 6
}

function calculatePipDiff(board: number[], player: PlayerColor): number {
  const pips = calculatePipCount(board, player);
  const oppPlayer = player === 'white' ? 'black' : 'white';
  const oppPips = calculatePipCount(board, oppPlayer);
  return pips - oppPips; // Positive if we are behind (bad), Negative if we are ahead (good)
}

function calculatePipCount(board: number[], player: PlayerColor): number {
  const sign = player === 'white' ? 1 : -1;
  const barIndex = getBarIndex(player);
  let pipCount = 0;
  
  for (let point = 1; point <= 24; point++) {
      const checkers = board[point];
      if (!checkers) continue;
      
      const isOurs = (sign > 0 && checkers > 0) || (sign < 0 && checkers < 0);
      if (!isOurs) continue;
      
      const count = Math.abs(checkers);
      const distance = player === 'white' ? point : (25 - point);
      pipCount += count * distance;
  }
  
  const barCheckers = Math.abs(board[barIndex] ?? 0);
  if (barCheckers > 0) {
      pipCount += barCheckers * 25;
  }
  return pipCount;
}



export function calculateConditionalHitBonus(board: number[], player: PlayerColor): number {
  const oppPlayer = player === 'white' ? 'black' : 'white';
  const oppBarIndex = getBarIndex(oppPlayer);
  const oppCheckersOnBar = Math.abs(board[oppBarIndex] ?? 0);
  
  if (oppCheckersOnBar === 0) return 0;

  // Base bonus for each checker on the bar
  let bonus = oppCheckersOnBar * WEIGHTS.hitBonus;

  // Condition 1: Safety (Don't hit if it leaves us too exposed)
  const myRisk = calculateBlotRisk(board, player);
  if (myRisk > 1.5) {
    bonus *= 0.5; // Reduce bonus if hitting is very risky
  }

  // Condition 2: Board Strength (Hitting more valuable with a strong home board)
  const myBoardStrength = evaluateHomeBoard(board, player);
  // Multiplier: 0.8 (empty) to 1.5 (full board)
  const strengthMultiplier = 0.8 + (myBoardStrength / 6) * 0.7;
  
  return bonus * strengthMultiplier;
}

/**
 * Check if we are in "Race Mode" (No contact)
 */
export function isRaceMode(board: number[]): boolean {
    // Check indices:
    let maxWhiteIndex = 0;
    let minBlackIndex = 25;
    
    for (let i = 1; i <= 24; i++) {
        if ((board[i] ?? 0) > 0) maxWhiteIndex = Math.max(maxWhiteIndex, i);
        if ((board[i] ?? 0) < 0) minBlackIndex = Math.min(minBlackIndex, i);
    }
    
    // Check bars too
    if ((board[getBarIndex('white')] ?? 0) > 0) return false; // Contact possible
    if ((board[getBarIndex('black')] ?? 0) < 0) return false;
    
    // If White largest index < Black smallest index, they have passed.
    return maxWhiteIndex < minBlackIndex;
}

// -----------------------------------------------------------
// Helpers for Move Generation (Dice)
// -----------------------------------------------------------
function getAllDiceCombinations(): Array<{ dice: number[]; probability: number }> {
  const combinations: Array<{ dice: number[]; probability: number }> = [];
  
  // Generate all 36 ordered dice combinations for 2 dice (backgammon standard)
  for (let die1 = 1; die1 <= 6; die1++) {
    for (let die2 = 1; die2 <= 6; die2++) {
      combinations.push({
        dice: [die1, die2],
        probability: 1 / 36,
      });
    }
  }
  return combinations;
}
