/**
 * Backgammon Game Constants
 */

// Board positions
// Board positions
export const BOARD_SIZE = 30; // 0..25 (unused/legacy) + 26..29 (special zones)

// Points 1-24 are standard board points
export const POINTS_START = 1;
export const POINTS_END = 24;

// Special Zones (virtual indices to prevent collision)
export const BAR_WHITE = 26; // White checkers on bar (enter 24..19)
export const BAR_BLACK = 27; // Black checkers on bar (enter 1..6)
export const OFF_WHITE = 28; // White checkers borne off
export const OFF_BLACK = 29; // Black checkers borne off

// Legacy constants (marked for removal/refactor checking)
// export const BAR = 0; // DEPRECATED
// export const OFF = 25; // DEPRECATED

// Direction multipliers
export const WHITE_DIRECTION = -1; // White moves from 24 to 1
export const BLACK_DIRECTION = 1;  // Black moves from 1 to 24

// Home board ranges
export const WHITE_HOME_START = 1;
export const WHITE_HOME_END = 6;
export const BLACK_HOME_START = 19;
export const BLACK_HOME_END = 24;

// Initial board setup (Standard Backgammon)
// 30 slots total. 0 and 25 are Unused/Buffer.
export const INITIAL_BOARD = Array(BOARD_SIZE).fill(0);

// Set standard non-zero positions
INITIAL_BOARD[1] = -2;   // 1: 2 black
INITIAL_BOARD[6] = 5;    // 6: 5 white
INITIAL_BOARD[8] = 3;    // 8: 3 white
INITIAL_BOARD[12] = -5;  // 12: 5 black
INITIAL_BOARD[13] = 5;   // 13: 5 white
INITIAL_BOARD[17] = -3;  // 17: 3 black
INITIAL_BOARD[19] = -5;  // 19: 5 black
INITIAL_BOARD[24] = 2;   // 24: 2 white
