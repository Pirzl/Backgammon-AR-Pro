import type { UIGameState } from "../model/types";
import {
  BAR_WHITE,
  BAR_BLACK,
  OFF_WHITE,
  OFF_BLACK,
} from "../../../entities/game/constants";

interface AICommentaryResult {
  summary: string;
  tension: "Low" | "Medium" | "Critical";
}

export function generateBoardSummary(state: UIGameState): AICommentaryResult {
  const { board, turn, dice, matchScore } = state;
  const isWhite = turn === "white";

  // 1. Basic Stats
  const whiteBar =
    typeof board[BAR_WHITE] === "number" && board[BAR_WHITE] > 0
      ? board[BAR_WHITE]
      : 0;
  const blackBar =
    typeof board[BAR_BLACK] === "number" && board[BAR_BLACK] < 0
      ? Math.abs(board[BAR_BLACK])
      : 0;

  const whiteOff =
    typeof board[OFF_WHITE] === "number" && board[OFF_WHITE] > 0
      ? board[OFF_WHITE]
      : 0;
  const blackOff =
    typeof board[OFF_BLACK] === "number" && board[OFF_BLACK] < 0
      ? Math.abs(board[OFF_BLACK])
      : 0;

  // 2. Identify Blots and Primes
  let whiteBlots = 0;
  let blackBlots = 0;
  let whiteMaxPrime = 0;
  let blackMaxPrime = 0;
  let currentWPrime = 0;
  let currentBPrime = 0;

  for (let i = 1; i <= 24; i++) {
    const checkers: number = board[i] ?? 0;
    if (checkers === 1) whiteBlots++;
    else if (checkers === -1) blackBlots++;

    if (checkers >= 2) {
      currentWPrime++;
      whiteMaxPrime = Math.max(whiteMaxPrime, currentWPrime);
      currentBPrime = 0;
    } else if (checkers <= -2) {
      currentBPrime++;
      blackMaxPrime = Math.max(blackMaxPrime, currentBPrime);
      currentWPrime = 0;
    } else {
      currentWPrime = 0;
      currentBPrime = 0;
    }
  }

  // 3. Tension Assessment
  let tension: "Low" | "Medium" | "Critical" = "Low";
  let tensionScore = 0;

  if (whiteBar > 0) tensionScore += whiteBar * 2;
  if (blackBar > 0) tensionScore += blackBar * 2;

  const activeBlots = isWhite ? whiteBlots : blackBlots;
  tensionScore += activeBlots;

  // Game ending soon? (High tension if very close race)
  if (whiteOff > 10 || blackOff > 10) tensionScore += 3;

  if (tensionScore >= 5) tension = "Critical";
  else if (tensionScore >= 2) tension = "Medium";

  // 3.5 Calculate Pip Count (Distance to bear off)
  let whitePips = 0;
  let blackPips = 0;
  
  for (let i = 1; i <= 24; i++) {
    const checkers = board[i] ?? 0;
    if (checkers > 0) {
      whitePips += checkers * i; // White moves from 24 to 1
    } else if (checkers < 0) {
      blackPips += Math.abs(checkers) * (25 - i); // Black moves from 1 to 24
    }
  }
  if (whiteBar > 0) whitePips += whiteBar * 25;
  if (blackBar > 0) blackPips += blackBar * 25;

  // 4. Generate Natural Language Summary in Spanish for better AI context
  const diceString =
    dice.length > 0 ? `[Dados actuales: ${dice.join(", ")}]. ` : "";
  const scoreString = `[Marcador Jugador (Blancas): ${matchScore.white} - IA (Negras): ${matchScore.black}]. `;

  const summary = `
Estado del Tablero de Backgammon: Es el turno de ${turn === 'white' ? 'las BLANCAS (JUGADOR HUMANO)' : 'las NEGRAS (TÚ, IA GRAN MAESTRO)'}. ${scoreString}${diceString}
Fichas BLANCAS (Jugador): ${whiteOff} salvadas, ${whiteBar} en la barra (capturadas), ${whiteBlots} fichas vulnerables (blots), mayor muro: ${whiteMaxPrime}. (Pips restantes: ${whitePips})
Fichas NEGRAS (Tú, IA): ${blackOff} salvadas, ${blackBar} en la barra (capturadas), ${blackBlots} fichas vulnerables (blots), mayor muro: ${blackMaxPrime}. (Pips restantes: ${blackPips})
Nota: Quien tiene MENOS pips está ganando la carrera.
  `.trim();

  return { summary, tension };
}

/**
 * useAICommentary Hook
 * Wraps translation to easily invoke inside components
 */
export function useAICommentary() {
  return {
    generateBoardSummary,
  };
}
