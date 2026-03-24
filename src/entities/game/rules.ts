/**
 * Backgammon Game Rules Implementation
 * Pure TypeScript - No React dependencies
 * Can be used in Web Workers and main thread
 */

import type { GameState, Move, MoveValidation, PlayerColor } from './types';
import {
  POINTS_START,
  POINTS_END,
  BAR_WHITE,
  BAR_BLACK,
  OFF_WHITE,
  OFF_BLACK,
  WHITE_DIRECTION,
  BLACK_DIRECTION,
  WHITE_HOME_START,
  WHITE_HOME_END,
  BLACK_HOME_START,
  BLACK_HOME_END,
} from './constants';

/**
 * Get the bar index for a specific player
 */
export function getBarIndex(player: PlayerColor): number {
  return player === 'white' ? BAR_WHITE : BAR_BLACK;
}

/**
 * Get the off index for a specific player
 */
export function getOffIndex(player: PlayerColor): number {
  return player === 'white' ? OFF_WHITE : OFF_BLACK;
}

/**
 * Get direction multiplier for a player
 */
export function getDirection(player: PlayerColor): number {
  return player === 'white' ? WHITE_DIRECTION : BLACK_DIRECTION;
}

/**
 * Get home board range for a player
 */
export function getHomeBoard(player: PlayerColor): [number, number] {
  return player === 'white' 
    ? [WHITE_HOME_START, WHITE_HOME_END]
    : [BLACK_HOME_START, BLACK_HOME_END];
}

/**
 * Check if a player has checkers on their bar
 */
export function hasCheckersOnBar(board: number[], player: PlayerColor): boolean {
  const barIndex = getBarIndex(player);
  const barCount = board[barIndex];
  if (!barCount) return false;
  
  // White checkers are positive, Black are negative
  return player === 'white' ? barCount > 0 : barCount < 0;
}

/**
 * Check if all checkers are in home board (required for bearing off)
 */
export function allCheckersHome(board: number[], player: PlayerColor): boolean {
  const [homeStart, homeEnd] = getHomeBoard(player);
  const sign = player === 'white' ? 1 : -1;
  
  // Check bar
  if (hasCheckersOnBar(board, player)) return false;
  
  // Check all points outside home
  for (let i = POINTS_START; i <= POINTS_END; i++) {
    if (i >= homeStart && i <= homeEnd) continue; // Skip home board
    
    const checkers = board[i];
    if (!checkers) continue;
    
    // If this point has our checkers, they're not all home
    if ((sign > 0 && checkers > 0) || (sign < 0 && checkers < 0)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if bearing off is allowed and valid
 */
export function canBearOff(
  board: number[],
  from: number,
  die: number,
  player: PlayerColor
): MoveValidation {
  // Must have all checkers home
  if (!allCheckersHome(board, player)) {
    return { valid: false, reason: 'Not all checkers are home' };
  }
  
  const [homeStart, homeEnd] = getHomeBoard(player);
  const direction = getDirection(player);
  // Calculate exact target logic for bearing off
  // For White (Home 1-6): Moving -1. From 2, die 2 -> 0. From 2, die 3 -> -1.
  // We need to map "off board" to the OFF index logic.
  
  const simulatedTarget = from + (die * direction);
  
  // Exact bear-off condition
  // White: from 1, die 1 -> 0. from 6, die 6 -> 0.
  // Black: from 24, die 1 -> 25. from 19, die 6 -> 25.
  
  // Check Exact Bear Off:
  // White: Target <= 0 implies off?
  // Black: Target > 24 implies off?
  const isExactOrOver = player === 'white' 
    ? simulatedTarget < 1 
    : simulatedTarget > 24;

  if (!isExactOrOver) {
      // Not a bear off move attempt if it lands on board
      return { valid: false, reason: 'Move does not bear off' };
  }
  
  // Now validate specific "Higher Die" rules
  
  // Exact validation (e.g. from 6, die 6)
  // White: from 6 (die 6) -> 0. Perfect.
  // Black: from 19 (die 6) -> 25. Perfect.
  const isExact = player === 'white' ? simulatedTarget === 0 : simulatedTarget === 25;
  
  if (isExact) {
      return { valid: true };
  }
  
  // Over-bearing validation (e.g. from 5, die 6)
  // Must be no checkers on higher points.
  
  if (player === 'white') {
    // White moves 24->1. Higher points are 6, 5, 4... relative to home?
    // "Higher point" means further away from off.
    // For White (Home 1-6), Off is <1. 6 is furthest.
    // Use die for higher point: If I am at 5, and roll 6, 
    // I can only do it if no checkers at 6.
    
    for (let i = from + 1; i <= homeEnd; i++) { // Check 6, etc.
         // Wait. White home end is 6. Home start is 1.
         // If I am at 4. I check 5, 6.
         // Wait, `from - 1` in previous code??
         // Previous code: `for (let i = from - 1; i >= homeStart; i--)` (White direction -1??)
         // Let's stick to standard logic.
         // White moves 24->1.
         // Points: 6, 5, 4, 3, 2, 1.
         // If `from`=2. Checkers at 3,4,5,6?
         // Yes, check standard indices > from.
         // Wait, "Higher Point" in Backgammon means "Point with higher index"?
         // Standard: "Higher numbered point".
         // White home: 1-6. 6 is highest.
         // If White at 2. 3,4,5,6 are higher.
         // Yes.
    }
    
    // Check points higher than 'from' up to homeEnd
    for (let i = from + 1; i <= homeEnd; i++) {
        if ((board[i] ?? 0) > 0) {
            return { valid: false, reason: 'Must use die for higher point' };
        }
    }
    return { valid: true };
  } else {
    // Black moves 1->24. Home 19-24. 24 is closest to off?
    // Black Off is > 24.
    // Black Home: 19, 20, 21, 22, 23, 24.
    // 24 is closest to off (25).
    // "Higher Point" means "Further away".
    // Further away for Black = Lower Index (19).
    // If Black at 23. Roll 6. Target 29.
    // Can I bear off? Only if no checkers at 19, 20, 21, 22?
    // Wait. "Higher point" rule: "If the die roll is higher than the point number..."
    // "...you may bear off from the highest point that has a checker."
    
    // Example: Black at 22. Roll 6.
    // 22 + 6 = 28. Over.
    // Allow if no checkers at 19, 20, 21?
    // No. 19 is further away.
    // Black moves 1 -> 24.
    // Distance to off: 25 - index.
    // Index 24: Distance 1.
    // Index 19: Distance 6.
    // Checkers at "Higher Point" means "Point with greater distance".
    // For Black, greater distance = Smaller Index.
    
    for (let i = from - 1; i >= homeStart; i--) {
        if ((board[i] ?? 0) < 0) {
            return { valid: false, reason: 'Must use die for higher point' };
        }
    }
    return { valid: true };
  }
}

/**
 * Helper to get available dice accounting for duplicates
 */
export function getAvailableDice(dice: number[], usedDice: number[]): number[] {
  const available = [...dice];
  for (const used of usedDice) {
    const idx = available.indexOf(used);
    if (idx !== -1) {
      available.splice(idx, 1);
    }
  }
  return available;
}

/**
 * Validate a move
 */
export function isValidMove(
  state: GameState,
  move: Move
): MoveValidation {
  const { board, turn, dice, usedDice } = state;
  const { from, to, die } = move;
  
  // Must be player's turn
  const sign = turn === 'white' ? 1 : -1;
  
  // Check if die is available (accounting for duplicates)
  const availableDice = getAvailableDice(dice, usedDice);
  if (!availableDice.includes(die)) {
    return { valid: false, reason: 'Die not available' };
  }
  
  const barIndex = getBarIndex(turn);
  const offIndex = getOffIndex(turn);
  
  // Must move from bar first
  if (hasCheckersOnBar(board, turn) && from !== barIndex) {
    return { valid: false, reason: 'Must enter from bar first' };
  }
  
  // ... rest of validation logic ...
  
  // Check origin has player's checker
  const fromCheckers = board[from] ?? 0;
  if (!fromCheckers || (sign > 0 && fromCheckers <= 0) || (sign < 0 && fromCheckers >= 0)) {
    console.log(`Move Rejected: No checker at origin ${from} for ${turn}. Checkers: ${fromCheckers}`);
    return { valid: false, reason: 'No checker at origin' };
  }
  
  // Calculate expected destination
  let expectedTo: number;
  
  // Special Case 1: Bar Entry
  if (from === barIndex) {
      if (turn === 'white') {
          // White Bar (26) -> Enters 24..19
          // 25 - die
          expectedTo = 25 - die;
      } else {
          // Black Bar (27) -> Enters 1..6
          expectedTo = die;
      }
  } 
  // Special Case 2: Bearing Off (Destination provided as offIndex)
  else if (to === offIndex) {
       // Validate Bear Off logic specifically
      return canBearOff(board, from, die, turn);
  }
  // Standard Move
  else {
      const direction = getDirection(turn);
      expectedTo = from + (die * direction);
  }
  
  // Validate calculated destination matches provided destination (unless bear off handled above)
  if (expectedTo !== to) {
       return { valid: false, reason: 'Invalid destination for die value' };
  }
  
  // Check destination bounds (unless it was a handled bear-off)
  if (expectedTo < POINTS_START || expectedTo > POINTS_END) {
       return { valid: false, reason: 'Move out of bounds' };
  }
  
  // Check destination blocking
  const toCheckers = board[to] ?? 0;
  if (toCheckers && ((sign > 0 && toCheckers <= -2) || (sign < 0 && toCheckers >= 2))) {
    return { valid: false, reason: 'Destination blocked by opponent' };
  }
  
  return { valid: true };
}

/**
 * Get all valid moves for current game state
 */
export function getValidMoves(state: GameState): Move[] {
  const { board, turn, dice, usedDice } = state;
  const moves: Move[] = [];
  const availableDice = getAvailableDice(dice, usedDice);
  
  const barIndex = getBarIndex(turn);
  const offIndex = getOffIndex(turn);
  
  // Potential origins: Bar or Board Points
  const origins = [barIndex];
  for (let i = POINTS_START; i <= POINTS_END; i++) origins.push(i);
  
  for (const from of origins) {
    const checkers = board[from];
    if (!checkers) continue;
    
    const isOurs = (turn === 'white' && checkers > 0) || (turn === 'black' && checkers < 0);
    if (!isOurs) continue;
    
    // Try each available die
    // Filter duplicates to avoid redundant checks
    const uniqueDice = Array.from(new Set(availableDice));

    for (const die of uniqueDice) {
      // 1. Calculate Standard Destination
      let to: number;
      
      if (from === barIndex) {
          to = turn === 'white' ? 25 - die : die;
      } else {
          const direction = getDirection(turn);
          to = from + (die * direction);
      }
      
      // 2. Check Standard Move
      if (to >= POINTS_START && to <= POINTS_END) {
        const validation = isValidMove(state, { from, to, die });
        if (validation.valid) {
          moves.push({ from, to, die });
        }
      }
      
      // 3. Check Bear Off
      if (allCheckersHome(board, turn)) {
        const bearOffValidation = canBearOff(board, from, die, turn);
        if (bearOffValidation.valid) {
          moves.push({ from, to: offIndex, die });
        }
      }
    }
  }
  
  return moves;
}

/**
 * Apply a move to the board (pure function - returns new board)
 */
export function applyMove(board: number[], move: Move, player: PlayerColor): number[] {
  const newBoard = [...board];
  const { from, to } = move;
  const sign = player === 'white' ? 1 : -1;
  
  // Remove checker from origin
  const fromValue = newBoard[from] ?? 0;
  newBoard[from] = fromValue - sign;
  
  // Check for hit (blot) - Only if destination is on the board
  // If destination is OFF (28/29), no hit possible
  const isOffMove = to === OFF_WHITE || to === OFF_BLACK;
  
  if (!isOffMove) {
      const destCheckers = newBoard[to] ?? 0;
      if (destCheckers && ((sign > 0 && destCheckers === -1) || (sign < 0 && destCheckers === 1))) {
        // HIT!
        // Send opponent checker to THEIR bar
        const opponentBar = getBarIndex(player === 'white' ? 'black' : 'white');
        const barValue = newBoard[opponentBar] ?? 0;
        
        // Add opponent checker to bar (White adds +1, Black adds -1?)
        // Wait. White pieces are +1. Black are -1.
        // If White hits Black (value -1). Black piece goes to Bar.
        // Black Bar should decrease by 1 (add -1).
        
        // Wait, destCheckers is -1.
        // If I move it to bar, I add it?
        newBoard[opponentBar] = barValue + destCheckers;
        
        // Clear destination (it's now 0, before my piece lands)
        newBoard[to] = 0;
      }
  }
  
  // Place checker at destination
  const toValue = newBoard[to] ?? 0;
  newBoard[to] = toValue + sign;
  
  return newBoard;
}
