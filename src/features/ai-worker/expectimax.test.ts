
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

  // Note: getGamePlan and countTrappedCheckers are intentionally kept internal
  // to avoid over-coupling tests with AI internals. Their effects are validated
  // indirectly via evaluatePosition behaviour in the scenarios above.
});
