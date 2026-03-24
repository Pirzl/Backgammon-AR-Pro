/**
 * Game Utilities
 * Helper functions for game logic
 */

import type { GameState } from './types';
import { getValidMoves } from './rules';

/**
 * Roll dice and return array of die values
 * Handles doubles correctly (4 instances of same number)
 */
export function rollDice(): number[] {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  
  // Doubles: play the number 4 times
  if (die1 === die2) {
    return [die1, die1, die1, die1];
  }
  
  return [die1, die2];
}

/**
 * Check if player can play both dice
 * Used to enforce "must play higher die if only one can be played"
 */
export function canPlayBothDice(state: GameState): boolean {
  const { dice, usedDice } = state;
  const availableDice = dice.filter(d => !usedDice.includes(d));
  
  if (availableDice.length < 2) return false;
  
  const validMoves = getValidMoves(state);
  
  // Check if we can find moves for both dice
  const uniqueDice = [...new Set(availableDice)];
  if (uniqueDice.length === 1) {
    // Doubles: can we play at least 2 moves?
    return validMoves.length >= 2;
  }
  
  // Different dice: can we play one of each?
  const canPlayFirst = validMoves.some(m => m.die === uniqueDice[0]);
  const canPlaySecond = validMoves.some(m => m.die === uniqueDice[1]);
  
  return canPlayFirst && canPlaySecond;
}

/**
 * Validate that player is using dice correctly
 * Enforces: "If only one die can be played, must play the higher one"
 */
export function validateDiceUsage(state: GameState, proposedDie: number): {
  valid: boolean;
  reason?: string;
} {
  const { dice, usedDice } = state;
  const availableDice = dice.filter(d => !usedDice.includes(d));
  
  if (availableDice.length === 0) {
    return { valid: false, reason: 'No dice available' };
  }
  
  // If only one die left, must use it
  if (availableDice.length === 1) {
    return { valid: true };
  }
  
  // Check if both dice can be played
  const canPlayBoth = canPlayBothDice(state);
  
  if (canPlayBoth) {
    // Can play both, so either is fine
    return { valid: true };
  }
  
  // Can only play one die - must be the higher one
  const uniqueDice = [...new Set(availableDice)];
  if (uniqueDice.length === 1) {
    // Doubles - any instance is fine
    return { valid: true };
  }
  
  const higherDie = Math.max(...uniqueDice);
  const validMoves = getValidMoves(state);
  const canPlayHigher = validMoves.some(m => m.die === higherDie);
  
  if (canPlayHigher && proposedDie !== higherDie) {
    return { 
      valid: false, 
      reason: `Must play higher die (${higherDie}) when only one can be played` 
    };
  }
  
  return { valid: true };
}
