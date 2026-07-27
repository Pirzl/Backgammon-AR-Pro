import { describe, it, expect } from 'vitest';
import { getValidMoves, isValidMove, applyMove, allCheckersHome } from './src/entities/game/rules';
import { BOARD_SIZE, OFF_WHITE, OFF_BLACK } from './src/entities/game/constants';

const mk = (spec: Record<number, number>) => {
  const b = Array(BOARD_SIZE).fill(0);
  for (const [k, v] of Object.entries(spec)) b[+k] = v;
  return b;
};

describe('E2E bear-off: generate -> revalidate -> apply', () => {
  it('WHITE: every generated bear-off move survives isValidMove + applyMove', () => {
    const st: any = {
      board: mk({ 6: 5, 5: 5, 4: 5 }),
      turn: 'white', dice: [6, 3], usedDice: [], winner: null,
    };
    const moves = getValidMoves(st);
    const offMoves = moves.filter(m => m.to === OFF_WHITE);
    console.log('WHITE generated off-moves:', JSON.stringify(offMoves));
    expect(offMoves.length).toBeGreaterThan(0);

    for (const m of offMoves) {
      const v = isValidMove(st, m);
      console.log('  revalidate', JSON.stringify(m), '=>', JSON.stringify(v));
      expect(v.valid, `isValidMove rejected generated move ${JSON.stringify(m)}: ${v.reason}`).toBe(true);
      const next = { board: applyMove(st.board, m, 'white') };
      console.log('   applied: OFF_WHITE count =', next.board[OFF_WHITE], ' from-point =', next.board[m.from]);
      expect(next.board[OFF_WHITE]).toBe(1);
    }
  });

  it('WHITE: full sequence bears off all 15', () => {
    let st: any = { board: mk({ 6: 5, 5: 5, 4: 5 }), turn: 'white', dice: [6, 6], usedDice: [], winner: null };
    let off = 0, guard = 0;
    while (off < 15 && guard++ < 200) {
      st.dice = [6, 6]; st.usedDice = [];
      const mv = getValidMoves(st).filter((m: any) => m.to === OFF_WHITE);
      if (!mv.length) { console.log('STUCK at off=', off, 'board=', JSON.stringify(st.board.slice(0,8)), 'allHome=', allCheckersHome(st.board,'white')); break; }
      st = { ...st, board: applyMove(st.board, mv[0], 'white') };
      off = st.board[OFF_WHITE];
    }
    console.log('WHITE total borne off:', off);
    expect(off).toBe(15);
  });

  it('BLACK: every generated bear-off move survives isValidMove', () => {
    const st: any = {
      board: mk({ 19: -5, 20: -5, 21: -5 }),
      turn: 'black', dice: [6, 3], usedDice: [], winner: null,
    };
    const offMoves = getValidMoves(st).filter(m => m.to === OFF_BLACK);
    console.log('BLACK generated off-moves:', JSON.stringify(offMoves));
    expect(offMoves.length).toBeGreaterThan(0);
    for (const m of offMoves) {
      const v = isValidMove(st, m);
      console.log('  revalidate', JSON.stringify(m), '=>', JSON.stringify(v));
      expect(v.valid, `rejected: ${v.reason}`).toBe(true);
    }
  });
});
