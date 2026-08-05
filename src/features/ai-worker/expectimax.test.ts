
import { describe, test, expect, beforeEach } from 'vitest';
import { 
  calculatePrimeScore, 
  calculateAnchorScore, 
  calculateBlotRisk,
  isRaceMode,
  evaluatePosition
} from './expectimax';
import { BOARD_SIZE, OFF_WHITE } from '../../entities/game/constants';

describe('AI Heuristics', () => {
  let emptyBoard: number[];

  beforeEach(() => {
    emptyBoard = Array(BOARD_SIZE).fill(0);
  });

  describe('A) Prime Recognition', () => {
    test('should score a 5-prime higher than scattered points', () => {
      // Setup 5-prime for White at 2,3,4,5,6
      const primeBoard = [...emptyBoard];
      primeBoard[2] = 2; primeBoard[3] = 2; primeBoard[4] = 2; primeBoard[5] = 2; primeBoard[6] = 2;
      
      // Setup scattered points (same checker count)
      const scatteredBoard = [...emptyBoard];
      scatteredBoard[2] = 2; scatteredBoard[6] = 2; scatteredBoard[10] = 2; scatteredBoard[15] = 2; scatteredBoard[20] = 2;
      
      const primeScore = calculatePrimeScore(primeBoard, 'white');
      const scatteredScore = calculatePrimeScore(scatteredBoard, 'white');
      
      expect(primeScore).toBeGreaterThan(scatteredScore);
      expect(primeScore).toBe(2.0); // Should trigger 5-prime bonus
    });
  });

  describe('B) Anchor Recognition', () => {
    test('should score Golden Anchor (20-point) higher than no anchor', () => {
      // White Golden Anchor is at index 20 (Opponent's 5-point)
      const anchorBoard = [...emptyBoard];
      anchorBoard[20] = 2; 
      
      const noAnchorBoard = [...emptyBoard];
      noAnchorBoard[13] = 2; // Mid-board point
      
      const anchorScore = calculateAnchorScore(anchorBoard, 'white');
      const noAnchorScore = calculateAnchorScore(noAnchorBoard, 'white');
      
      expect(anchorScore).toBeGreaterThan(noAnchorScore);
      expect(anchorScore).toBeCloseTo(1.2); // Matches weight in pseudocode
    });

    test('should score Deep Anchor (24-point) less than Golden Anchor', () => {
      const goldenBoard = [...emptyBoard];
      goldenBoard[20] = 2;
      
      const deepBoard = [...emptyBoard];
      deepBoard[24] = 2;
      
      const goldenScore = calculateAnchorScore(goldenBoard, 'white');
      const deepScore = calculateAnchorScore(deepBoard, 'white');
      
      expect(goldenScore).toBeGreaterThan(deepScore);
    });
  });

  describe('C) Blot Risk', () => {
    test('should penalize a blot near an opponent heavily', () => {
        // White Blot 10. Black at 8. (Dist 2).
        // White moves -1. Black moves +1. Black at 8 hits 10.
        const riskBoard = [...emptyBoard];
        riskBoard[10] = 1; // White Blot
        riskBoard[8] = -1; // Black Threat (Close)
        
        // Safe Blot: White Blot 10. Black at 20. (Ahead).
        // Black moves 1->24. 20 is past 10. Safe.
        const safeBoard = [...emptyBoard];
        safeBoard[10] = 1;
        safeBoard[20] = -1; 
        
        const riskScore = calculateBlotRisk(riskBoard, 'white');
        const safeScore = calculateBlotRisk(safeBoard, 'white');
        
        // High risk score means HIGH penalty (bad). 
        // calculateBlotRisk returns a POSITIVE risk number (higher is riskier).
        // evaluatePosition subtracts it.
        expect(riskScore).toBeGreaterThan(safeScore);
        expect(riskScore).toBeGreaterThan(0.3); // Min base risk
    });
  });

  describe('D) Race Mode', () => {
    test('should detect race mode when no contact possible', () => {
      // White at 1, 2. Black at 23, 24.
      // White max index 2. Black min index 23.
      // 2 < 23. No contact.
      const raceBoard = [...emptyBoard];
      raceBoard[1] = 5; raceBoard[2] = 5;
      raceBoard[23] = -5; raceBoard[24] = -5;
      
      expect(isRaceMode(raceBoard)).toBe(true);
    });

    test('should NOT detect race mode when contact possible', () => {
      // White at 20. Black at 10.
      // White max 20. Black min 10.
      // 20 > 10. Contact possible (White must pass Black).
      const contactBoard = [...emptyBoard];
      contactBoard[20] = 5;
      contactBoard[10] = -5;
      
      expect(isRaceMode(contactBoard)).toBe(false);
    });
  });

  describe('E) Bearing Off Preference', () => {
    test('should prefer positions with more borne-off checkers in race/bear-off phase', () => {
      const boardNoOff = [...emptyBoard];
      const boardWithOff = [...emptyBoard];

      // Pure race: only white checkers, all inside home board (points 1-6).
      // No black checkers on board or bar/off so isRaceMode is true.
      // Place 15 white checkers on point 1.
      boardNoOff[1] = 15;

      // Same total checkers, but one already borne off.
      boardWithOff[1] = 14;
      boardWithOff[OFF_WHITE] = 1;

      // Sanity: both should be race mode positions.
      expect(isRaceMode(boardNoOff)).toBe(true);
      expect(isRaceMode(boardWithOff)).toBe(true);

      const noOffScore = evaluatePosition(boardNoOff, 'white');
      const withOffScore = evaluatePosition(boardWithOff, 'white');

      expect(withOffScore).toBeGreaterThan(noOffScore);
    });
  });

  describe('F) Pip momentum in contact mode', () => {
    test('should penalize being far behind on pips in a contact position', () => {
      // Contact position (both colors overlap): white blot + black checkers
      // so isRaceMode is false. Same board shape, only the pip distribution
      // differs: one side has a big pip lead (ahead = more borne-off / closer
      // to home), the other is stuck far back.
      const behindBoard = [...emptyBoard];
      // White (player) far behind: 2 white checkers deep at point 24, 13 white
      // checkers already home/bearing — but black still in contact.
      behindBoard[24] = 2;   // White back checkers
      behindBoard[6] = 5;    // White home
      behindBoard[8] = 5;    // White mid
      behindBoard[13] = 3;   // White mid
      behindBoard[1] = -2;   // Black back checkers (contact)
      behindBoard[12] = -5;  // Black mid
      behindBoard[19] = -5;  // Black home
      behindBoard[17] = -3;  // Black mid

      const aheadBoard = [...emptyBoard];
      // White (player) far ahead: checkers moved home / borne off, black still
      // stuck far back with more pips.
      aheadBoard[24] = 1;    // White back checker
      aheadBoard[6] = 6;     // White home
      aheadBoard[8] = 6;     // White home-ish
      aheadBoard[4] = 2;     // White home
      aheadBoard[1] = -2;    // Black back checkers (contact, far behind)
      aheadBoard[12] = -5;   // Black mid
      aheadBoard[19] = -5;   // Black home
      aheadBoard[17] = -3;   // Black mid

      // Both must be contact positions (not race).
      expect(isRaceMode(behindBoard)).toBe(false);
      expect(isRaceMode(aheadBoard)).toBe(false);

      const behindScore = evaluatePosition(behindBoard, 'white');
      const aheadScore = evaluatePosition(aheadBoard, 'white');

      // The side with the pip lead should evaluate strictly higher.
      expect(aheadScore).toBeGreaterThan(behindScore);
    });

    test('should NOT penalize pip deficit when in a pure race (no contact)', () => {
      // Race mode: white all home, black all far — no overlap, so pip
      // momentum term is skipped and only the race branch applies.
      const raceAhead = [...emptyBoard];
      raceAhead[1] = 15;               // White all at home
      raceAhead[24] = -10;             // Black far back
      raceAhead[20] = -5;
      expect(isRaceMode(raceAhead)).toBe(true);

      const raceBehind = [...emptyBoard];
      raceBehind[1] = 5;               // White stuck near home
      raceBehind[6] = 10;
      raceBehind[24] = -10;            // Black far back
      raceBehind[20] = -5;
      expect(isRaceMode(raceBehind)).toBe(true);

      // Even though white is behind on pips in raceBehind, both go through
      // the same race branch (pip momentum is contact-only). The one with
      // more pips disadvantage should still score lower via the race pip term.
      const aheadScore = evaluatePosition(raceAhead, 'white');
      const behindScore = evaluatePosition(raceBehind, 'white');
      expect(aheadScore).toBeGreaterThan(behindScore);
    });
  });

  // Note: getGamePlan and countTrappedCheckers are intentionally kept internal
  // to avoid over-coupling tests with AI internals. Their effects are validated
  // indirectly via evaluatePosition behaviour in the scenarios above.
});
