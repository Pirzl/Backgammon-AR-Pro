import fs from 'fs';

const path = 'src/features/game-board/ai-service.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace Opening
const oldOpening = `      GAME PHASE: OPENING
      STRATEGIC PRIORITIES (in order):
      1. MAKE KEY POINTS: Prioritize making the 5-point (index 5 for you) and the bar-point (index 7).
         These are the two most valuable points in backgammon.
      2. SPLIT BACK CHECKERS: Move one of your back checkers (from point 1) toward points 2-5.
         This creates an anchor and diversifies your position.
      3. BRING BUILDERS: Move checkers from point 12 and 17 toward your home board zone (13-18)
         to become builders for making new points.
      4. AVOID: Don't stack too many checkers on one point (>3 is inefficient).
         Don't leave blots in your opponent's home board unless you get hit, you gain tempo.
      
      KNOWN BEST OPENING MOVES (if applicable):
      - Dice 3-1: Make your 5-point (move from 8→5 and 6→5) — the BEST opening roll.
      - Dice 6-1: Make your bar point (move from 13→7 and 8→7).
      - Dice 4-2: Make your 4-point (move from 8→4 and 6→4).
      - Dice 5-3: Make your 3-point (move from 8→3 and 6→3).
      - Dice 6-5: Run a back checker (move from 1→12).
      - Dice 6-4: Run a back checker (move from 1→11).
      - Dice 6-3: Run one back checker to a safe point (move from 1→10, if safe) or split/build.
      - Dice 6-2: Move from 1→3 and 12→18 (split and build).
      - Dice 5-4: Move from 1→5 and 12→18 or split back runners.
      - Dice 5-2: Move from 12→17 and 1→3.
      - Dice 5-1: Move from 12→17 and 1→2.
      - Dice 4-3: Move from 12→16 and 1→4.
      - Dice 4-1: Move from 12→16 and 1→2.
      - Dice 3-2: Move from 12→15 and 1→3.
      - Dice 2-1: Move from 12→14 and 1→2.
      NOTE: These are from BLACK's perspective (moving LOW→HIGH). Adapt if your pieces are no longer at starting positions.`;

const newOpening = `      GAME PHASE: OPENING
      STRATEGIC PRIORITIES (in order):
      1. MAKE KEY POINTS: Prioritize making the 5-point (index 5 for you) and the bar-point (index 7).
         These are the two most valuable points in backgammon.
      2. RISK FOR REWARD (EV): It is mathematically correct to leave a blot if the benefit of building a key point (5-pt or 7-pt) outweighs the risk.
         The probability of being hit by a direct shot (1-6 pips) is about 30.6% (11/36). The reward of the 5-point is worth this risk.
      3. SPLIT BACK CHECKERS: Move one of your back checkers (from point 1) toward points 2-5 early.
         This creates an anchor and diversifies your position.
      4. BRING BUILDERS: Move checkers from point 12 and 17 toward your home board zone (13-18)
         to become builders for making new points.
      5. AVOID: Don't stack too many checkers on one point (>3 is inefficient).
      
      KNOWN BEST OPENING MOVES & RESPONSES:
      - Dice 3-1: Make your 5-point (move from 8→5 and 6→5) — EL MEJOR MOVIMIENTO POSIBLE.
      - Dice 6-1: Make your bar point (move from 13→7 and 8→7).
      - Dice 4-2: Make your 4-point (move from 8→4 and 6→4).
      - Dice 2-1: SLOT the 5-point (move 6→5) and split (24→23). Value > Risk.
      - Dice 5-2 or 6-2: SPLIT back checkers and bring a builder down (e.g., 24→22 and 13→8).
      - Dice 5-3: Make your 3-point (move from 8→3 and 6→3).
      - Dice 6-5: Run a back checker "Lover's Leap" (move from 1→12).
      - Dice 6-4 or 6-3: Run or Split back runners.
      - Dice 5-4, 4-3, 3-2: Split back checkers and bring builders down.
      NOTE: These are from BLACK's perspective (moving LOW→HIGH, so 1 is the 24-point). Adapt if your pieces moved.`;

// Replace Middle
const oldMiddle = `      GAME PHASE: MID-GAME
      STRATEGIC PRIORITIES (in order):
      1. BUILD PRIMES: Create consecutive blocked points (2+ checkers) to trap opponent checkers.
         A 4-point prime is strong, a 6-point prime is nearly unpassable.
         Your current prime strength: \${primeScore.toFixed(1)}/4.0
      2. SAFE CAPTURES: Hit opponent blots ONLY when:
         - You can do so without leaving yourself exposed, OR
         - The opponent blot is in YOUR home board area, OR
         - You have a strong home board (\${blackHomePoints}/6 points made).
         Opponent has \${whiteBlots} exposed blots.
      3. HOLD ANCHORS: Keep 2+ checkers on an advanced point in the opponent's home board.
         This gives you a safe landing if you get hit.
      4. AVOID UNNECESSARY BLOTS: You have \${blackBlots} blots. Each is a target.
         Consolidate when possible. Your blot risk score: \${blotRisk.toFixed(1)}.
      5. PIP EFFICIENCY: \${blackPips < whitePips ? 'You are AHEAD in the race — avoid unnecessary contact.' : 
         blackPips > whitePips ? 'You are BEHIND in the race — create contact, hit blots, slow them down.' : 
         'Race is EVEN — focus on positional advantage.'}`;

const newMiddle = `      GAME PHASE: MID-GAME
      STRATEGIC PRIORITIES (in order):
      1. BUILD PRIMES & BLITZ: Create consecutive blocked points (4-6 points) to trap opponent checkers.
         If opponent is on the bar, attack aggressively (Blitz) to close the board and go for Gammons.
         Your current prime strength: \${primeScore.toFixed(1)}/4.0
      2. CALCULATED RISKS (EV): Hit opponent blots even if it leaves you exposed, IF the reward (tempo, points) 
         outweighs the 30.6% risk of being hit back. 
         Opponent has \${whiteBlots} exposed blots. HITTING IS HIGHLY PROFITABLE in EV.
      3. HOLD ADVANCED ANCHORS: Keep 2+ checkers on advanced points (indices 4, 5) in the opponent's home board.
         Only release these anchors if the race heavily favors you or you are forced to.
      4. AVOID UNNECESSARY BLOTS: You have \${blackBlots} blots. Consolidate when possible unless tactically justified.
         Your blot risk score: \${blotRisk.toFixed(1)}.
      5. PIP EFFICIENCY (ARCHETYPAL PLANS): 
         \${blackPips < whitePips ? '- You are AHEAD in the race: Avoid contact, run, play safe.' : 
         blackPips > whitePips ? '- You are BEHIND in the race: Create contact, hold anchors (Backgame/Containment), hit blots.' : 
         '- Race is EVEN: Focus on positional advantage and primes.'}`;

// Replace Bearoff
const oldBearoff = `      GAME PHASE: BEAR-OFF
      STRATEGIC PRIORITIES:
      1. BEAR OFF EFFICIENTLY: Always bear off a checker if possible. Don't just move within home.
         You have borne off \${blackBorneOff}/15 checkers. Opponent has borne off \${whiteBorneOff}/15.
      2. USE EXACT ROLLS: If a die exactly bears off a checker, use it.
         From point 19, a die of 6 bears off. From point 23, a die of 2 bears off.
      3. HIGHEST POINT FIRST: When you can't bear off exactly, move from the highest occupied point.
      4. AVOID WASTING PIPS: Don't move checkers to lower points unnecessarily.
         Every wasted pip is a wasted turn.`;

const newBearoff = `      GAME PHASE: BEAR-OFF
      STRATEGIC PRIORITIES:
      1. BEAR OFF EFFICIENTLY: Always bear off a checker if possible. Don't just move within home.
         You have borne off \${blackBorneOff}/15 checkers. Opponent has borne off \${whiteBorneOff}/15.
      2. USE EXACT ROLLS: If a die exactly bears off a checker, use it.
      3. AVOID GAPS (7-5-3 PATTERN): Maintain checkers on the highest points (indices 19-24). 
         A flat distribution minimizes the mathematical probability of leaving shots if hit.
      4. HIGHEST POINT FIRST: When you can't bear off exactly, move from the highest occupied point.`;

content = content.replace(oldOpening, newOpening);
content = content.replace(oldMiddle, newMiddle);
content = content.replace(oldBearoff, newBearoff);

fs.writeFileSync(path, content, 'utf8');
console.log('Update successful!');
