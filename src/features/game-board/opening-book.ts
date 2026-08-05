/**
 * Opening-book logic for the VIVO master.
 *
 * Pure module (no Supabase / Vite / import.meta.env dependencies) so it can be
 * shared by the live master (`ai-service.ts`) and the offline faithful replay
 * analyzer (`scripts/ai-training/analyze-replay-faithful.ts`).
 *
 * Two layers:
 *   - `EXPERT_OPENING` / `getExpertOpeningSequence` (L9-10): exact full
 *     two-die opening sequences, White-perspective, mirrored for Black.
 *   - `getOpeningBook` (L7-8): per-move expert bonuses applied early game.
 *
 * IMPORTANT gate: both layers only fire while OUR checkers are still in the
 * initial opening arrangement (`isOpeningSetup`). Without this, the book keeps
 * firing on later rolls of the same dice (e.g. rolling 6-1 twice in a row) and
 * blindly re-applies the same opening, over-stacking a point the AI already
 * built — the deep oracle flags that as a real error (found 2026-08-02 in the
 * expert replay 8e6238f8, black T4 repeated 12->18,17->18).
 */

import { isValidMove, applyMove } from "../../entities/game/rules";
import type { GameState } from "../../entities/game/types";

export type OpeningBonus = { from: number; to: number; die: number; bonus: number };

/**
 * True when OUR checkers are still in the initial opening arrangement (i.e. it
 * is our first move of the game and we have not developed any checker yet).
 */
export function isOpeningSetup(board: number[], aiColor: "white" | "black"): boolean {
  if (aiColor === "white") {
    return (board[24] ?? 0) === 2 && (board[13] ?? 0) === 5 && (board[8] ?? 0) === 3 && (board[6] ?? 0) === 5;
  }
  return (board[1] ?? 0) === -2 && (board[12] ?? 0) === -5 && (board[17] ?? 0) === -3 && (board[19] ?? 0) === -5;
}

/** A4: exact expert opening table (user-provided), used only for L9-10. */
export const EXPERT_OPENING: Record<string, Array<{ from: number; to: number; die: number }>> = {
  "12": [{ from: 13, to: 11, die: 2 }, { from: 6, to: 5, die: 1 }],
  "13": [{ from: 8, to: 5, die: 3 }, { from: 6, to: 5, die: 1 }],
  "14": [{ from: 24, to: 23, die: 1 }, { from: 13, to: 9, die: 4 }],
  "15": [{ from: 24, to: 23, die: 1 }, { from: 13, to: 8, die: 5 }],
  "16": [{ from: 13, to: 7, die: 6 }, { from: 8, to: 7, die: 1 }],
  "23": [{ from: 24, to: 21, die: 3 }, { from: 13, to: 11, die: 2 }],
  "24": [{ from: 8, to: 4, die: 4 }, { from: 6, to: 4, die: 2 }],
  "25": [{ from: 24, to: 22, die: 2 }, { from: 13, to: 8, die: 5 }],
  "26": [{ from: 24, to: 18, die: 6 }, { from: 13, to: 11, die: 2 }],
  "34": [{ from: 13, to: 10, die: 3 }, { from: 13, to: 9, die: 4 }],
  "35": [{ from: 8, to: 3, die: 5 }, { from: 6, to: 3, die: 3 }],
  "36": [{ from: 24, to: 18, die: 6 }, { from: 13, to: 10, die: 3 }],
  "45": [{ from: 24, to: 20, die: 4 }, { from: 13, to: 8, die: 5 }],
  "46": [{ from: 24, to: 18, die: 6 }, { from: 13, to: 9, die: 4 }],
  "56": [{ from: 24, to: 18, die: 6 }, { from: 18, to: 13, die: 5 }],
};

export function getOpeningBook(
  dice: number[],
  board: number[],
  aiColor: "white" | "black",
  difficulty: number,
): OpeningBonus[] | null {
  const isWhite = aiColor === "white";

  // Only apply in the very early game AND while our own checkers are still in
  // the opening arrangement (first move). Without the isOpeningSetup gate the
  // book re-fires on later rolls of the same dice and over-stacks a point the
  // AI already built (found 2026-08-02, expert replay T4 black 6-1 repeat).
  if (!isOpeningSetup(board, aiColor)) return null;

  // The OPPONENT's back checkers are still stacked on their back point
  // (black's back = index 1, white's back = index 24). Must check the
  // opponent's own sign: white checkers are +, black are -. NOT Math.abs,
  // which counts our own stacked checkers as "opponent back checkers".
  const oppBack = isWhite ? (board[1] ?? 0) : (board[24] ?? 0);
  if (isWhite ? oppBack > -2 : oppBack < 2) return null;

  const diceSorted = [...dice].sort((a, b) => a - b).join("") as `${number}${number}`;
  const candidates: OpeningBonus[] = [];

  const add = (from: number, to: number, die: number, bonus: number) => {
    if (!isWhite) {
      candidates.push({ from: 25 - from, to: 25 - to, die, bonus });
      candidates.push({ from: 25 - to, to: 25 - from, die, bonus: bonus * 0.95 });
    } else {
      candidates.push({ from, to, die, bonus });
    }
  };

  // Difficulty-scoped opening book:
  // - 1-3: only strongest forced moves
  // - 4-6: basic splits + main point makers
  // - 7-10: full expert opening table
  if (diceSorted === "12") {
    if (difficulty >= 4) {
      add(13, 11, 1, 3.5); add(13, 11, 2, 3.5);
    }
    if (difficulty >= 7) {
      add(24, 23, 1, 1.2); add(6, 5, 1, 1.0);
    }
  } else if (diceSorted === "13") {
    if (difficulty >= 4) {
      add(8, 5, 1, 4.5); add(6, 5, 1, 3.5);
    }
    if (difficulty >= 7) {
      add(8, 5, 3, 4.5); add(6, 5, 3, 3.5);
    }
  } else if (diceSorted === "14") {
    if (difficulty >= 4) {
      add(24, 23, 1, 3.0); add(24, 23, 4, 3.0);
      add(13, 9, 4, 3.2);
    }
    if (difficulty >= 7) {
      add(6, 5, 1, 1.5);
    }
  } else if (diceSorted === "15") {
    if (difficulty >= 4) {
      add(24, 23, 1, 3.0); add(24, 23, 5, 3.0);
      add(13, 8, 5, 3.2);
    }
    if (difficulty >= 7) {
      add(6, 5, 1, 1.5);
    }
  } else if (diceSorted === "16") {
    if (difficulty >= 4) {
      add(13, 7, 1, 4.2); add(13, 7, 6, 4.2);
    }
    if (difficulty >= 7) {
      add(8, 7, 1, 2.4); add(8, 7, 6, 2.4);
    }
  } else if (diceSorted === "23") {
    if (difficulty >= 4) {
      add(24, 21, 2, 4.2); add(24, 21, 3, 4.2);
      add(13, 11, 2, 3.8);
    }
    if (difficulty >= 7) {
      add(13, 10, 3, 2.6); add(13, 11, 3, 2.8); add(24, 22, 2, 2.0); add(13, 10, 2, 2.4); add(13, 11, 3, 2.4);
    }
  } else if (diceSorted === "24") {
    if (difficulty >= 4) {
      add(8, 4, 2, 4.6); add(6, 4, 2, 4.6);
      add(8, 4, 4, 4.6); add(6, 4, 4, 4.6);
    }
  } else if (diceSorted === "25") {
    if (difficulty >= 4) {
      add(24, 22, 2, 3.6); add(24, 22, 5, 3.6);
      add(13, 8, 5, 3.8);
    }
    if (difficulty >= 7) {
      add(13, 11, 2, 2.4); add(13, 8, 2, 2.8);
    }
  } else if (diceSorted === "26") {
    if (difficulty >= 4) {
      add(24, 18, 2, 4.6); add(24, 18, 6, 4.6);
      add(13, 11, 2, 4.0);
    }
  } else if (diceSorted === "34") {
    if (difficulty >= 4) {
      add(13, 10, 3, 4.0); add(13, 10, 4, 4.0);
    }
    if (difficulty >= 7) {
      add(13, 9, 4, 3.4); add(24, 21, 3, 2.8); add(13, 9, 3, 3.0); add(24, 20, 4, 2.6);
    }
  } else if (diceSorted === "35") {
    if (difficulty >= 4) {
      add(8, 3, 3, 4.8); add(6, 3, 3, 4.8);
    }
    if (difficulty >= 7) {
      add(8, 3, 5, 4.8); add(6, 3, 5, 4.8);
    }
  } else if (diceSorted === "36") {
    if (difficulty >= 4) {
      add(24, 18, 3, 4.6); add(24, 18, 6, 4.6);
      add(13, 10, 3, 4.0);
    }
    if (difficulty >= 7) {
      add(24, 15, 6, 3.0);
    }
  } else if (diceSorted === "45") {
    if (difficulty >= 4) {
      add(24, 20, 4, 3.8); add(24, 20, 5, 3.8);
      add(13, 8, 5, 3.6); add(13, 9, 4, 3.4);
    }
    if (difficulty >= 7) {
      add(13, 9, 5, 3.2); add(13, 8, 4, 3.0);
    }
  } else if (diceSorted === "46") {
    if (difficulty >= 4) {
      add(24, 18, 4, 4.6); add(24, 18, 6, 4.6);
      add(13, 9, 4, 3.8);
    }
    if (difficulty >= 7) {
      add(8, 2, 4, 3.0); add(6, 2, 4, 3.0); add(24, 14, 6, 2.4);
    }
  } else if (diceSorted === "56") {
    if (difficulty >= 4) {
      add(24, 13, 5, 5.0); add(24, 13, 6, 5.0);
    }
  }

  return candidates.length > 0 ? candidates : null;
}

/**
 * Exact full two-die expert opening sequence (L9-10). Fires only while our
 * checkers are still in the initial arrangement and the opponent's back
 * checkers are still stacked — i.e. a genuine first-roll opening. Without the
 * isOpeningSetup gate the sequence re-applies on later rolls of the same dice
 * (e.g. 6-1 twice) and over-stacks a point the AI already built.
 */
export function getExpertOpeningSequence(
  dice: number[],
  board: number[],
  aiColor: "white" | "black",
): Array<{ from: number; to: number; die: number }> | null {
  if (!isOpeningSetup(board, aiColor)) return null;

  // Only in the very early game: the OPPONENT's back checkers are still stacked
  // on their back point (black's back = index 1, white's back = index 24).
  // Check the opponent's own sign (white +, black -) — NOT Math.abs, which
  // counts our own stacked checkers as "opponent back checkers".
  const oppBack = aiColor === "white" ? (board[1] ?? 0) : (board[24] ?? 0);
  if (aiColor === "white" ? oppBack > -2 : oppBack < 2) return null;

  const sorted = [...dice].sort((a, b) => a - b);
  const spec = EXPERT_OPENING[sorted.join("")];
  if (!spec) return null;

  const mirrored = spec.map((m) => ({
    from: aiColor === "white" ? m.from : 25 - m.from,
    to: aiColor === "white" ? m.to : 25 - m.to,
    die: m.die,
  }));

  // Validate every move on the evolving board; bail out if anything is illegal
  // (e.g. AI on the bar, a point already blocked). The master search then takes over.
  let simBoard = [...board];
  for (const m of mirrored) {
    const singleDieState: GameState = {
      board: simBoard,
      turn: aiColor,
      dice: [m.die],
      usedDice: [],
      cube: 1,
      cubeOwner: null,
      crawford: false,
      matchScore: { white: 0, black: 0 },
      winner: null,
    };
    const validation = isValidMove(singleDieState, m);
    if (!validation.valid) return null;
    simBoard = applyMove(simBoard, m, aiColor);
  }

  return mirrored;
}

export function applyOpeningBonus(
  candidates: { from: number; to: number; die: number }[],
  openingMoves: OpeningBonus[],
  difficulty: number,
): { from: number; to: number; die: number } | null {
  const bonusCap = difficulty >= 9 ? 3.0 : difficulty >= 7 ? 2.4 : 0;
  const eligible = openingMoves.filter((m) => m.bonus >= bonusCap);
  if (eligible.length === 0) return null;

  for (const bonusMove of eligible) {
    const hit = candidates.find((c) => c.from === bonusMove.from && c.to === bonusMove.to && c.die === bonusMove.die);
    if (hit) return hit;
  }
  return null;
}
