import { getValidMoves, applyMove, isValidMove } from "../../entities/game/rules";
import { evaluatePosition as heuristicEvaluate } from "../ai-worker/expectimax";
import { nnModel } from "./nn-model";
import { hashBoard } from "../ai-worker/zobrist";
import { fetchEvaluation, storeEvaluation } from "../ai-worker/api";
import { supabase } from "../../shared/api/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../shared/api/env";
import type { GameState } from "../../entities/game/types";

// ─── Gemini proxy via Supabase Edge Function (API key is SERVER-SIDE ONLY) ───
const GEMINI_PROXY_URL = `${SUPABASE_URL}/functions/v1/gemini-proxy`;

/** Call Gemini via Edge Function proxy (API key stays server-side) */
async function callGeminiProxy(
  prompt: string, 
  mode: 'analysis' | 'moves' = 'moves'
): Promise<string | { moves: { from: number; die: number }[] } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? SUPABASE_ANON_KEY;

    const response = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ prompt, mode }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('[Gemini Proxy Request Failed]:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// SMART FALLBACK: Score moves using expectimax evaluator
// ─────────────────────────────────────────────────────────────

async function pickBestMove(
  legalMoves: { from: number; to: number; die: number }[],
  availableDice: number[],
  simBoard: number[],
  aiColor: 'white' | 'black'
): Promise<{ from: number; to: number; die: number } | null> {
  const candidates = legalMoves.filter(m => availableDice.includes(m.die));
  if (candidates.length === 0) return null;

  let bestMove = candidates[0]!;
  let bestScore = -Infinity;

  for (const move of candidates) {
    const resultBoard = applyMove(simBoard, move, aiColor);
    
    let score: number;
    try {
      score = await nnModel.evaluate(resultBoard, aiColor);
      score = score * 50; 
    } catch (e) {
      console.warn("AI: NN Evaluation failed, using heuristic fallback", e);
      score = heuristicEvaluate(resultBoard, aiColor);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * ENGINE COORDINATE SYSTEM (from constants.ts & rules.ts):
 * Black (+), White (-) [Adjusted per project conventions]
 */
export async function getGrandmasterMove(
  boardState: number[],
  dice: number[],
  gameState?: GameState
): Promise<{ moves: { from: number; to: number; die: number }[] } | null> {
  const aiColor = gameState?.turn || 'black';

  try {
    const boardHash = hashBoard(boardState);

    // ─── 1. ZOBRIST CACHE CHECK ───────────────────────────────
    try {
      const cached = await fetchEvaluation(boardHash);
      if (cached?.best_move && gameState) {
        const validation = isValidMove(gameState, cached.best_move);
        if (validation.valid && dice.includes(cached.best_move.die)) {
           let simBoard = applyMove(boardState, cached.best_move, aiColor);
           const remainingDice = [...dice];
           remainingDice.splice(remainingDice.indexOf(cached.best_move.die), 1);
           const finalMoves = [cached.best_move];
           
           while (remainingDice.length > 0) {
              const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
              const simState = { ...gameState, board: simBoard, usedDice: simUsedDice };
              const legalMoves = getValidMoves(simState);
              if (legalMoves.length === 0) break;
              
              const picked = await pickBestMove(legalMoves, remainingDice, simBoard, aiColor);
              if (!picked) break;
              
              remainingDice.splice(remainingDice.indexOf(picked.die), 1);
              finalMoves.push(picked);
              simBoard = applyMove(simBoard, picked, aiColor);
           }
           console.log("🧠 Zobrist cache HIT! Moves: ", finalMoves);
           return { moves: finalMoves };
        }
      }
    } catch { /* Ignore */ }

    // ─── 2. LOCAL LOGIC ENGINE (CEREBRO LÓGICO) ───────────────
    const finalMoves: { from: number; to: number; die: number }[] = [];
    const availableDice = [...dice];
    let simBoard = [...boardState];

    if (availableDice.length > 0 && gameState) {
      while (availableDice.length > 0) {
        const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
        const simState = { ...gameState, board: simBoard, usedDice: simUsedDice };
        const legalMoves = getValidMoves(simState);
        if (legalMoves.length === 0) break;
        
        const picked = await pickBestMove(legalMoves, availableDice, simBoard, aiColor);
        if (!picked) break;
        
        availableDice.splice(availableDice.indexOf(picked.die), 1);
        finalMoves.push({ from: picked.from, to: picked.to, die: picked.die });
        simBoard = applyMove(simBoard, picked, aiColor);
      }
      
      if (finalMoves.length > 0) {
        storeEvaluation(boardHash, {
          best_move: finalMoves[0]!,
          equity: 0, 
          depth: 1
        }).catch(err => console.warn("🧠 AI Wisdom Sync Failed:", err));
      }
    }

    return { moves: finalMoves };
  } catch (error) {
    console.error("AI Logic Failed:", error);
    return null;
  }
}

/** Fetch the last 5 AI evaluations from Supabase for short-term memory */
export async function getRecentGameContext(gameId: string): Promise<string> {
  if (!gameId || gameId === '00000000-0000-0000-0000-000000000000') return '';
  try {
    const { data, error } = await supabase
      .from('game_history_analysis')
      .select('ai_evaluation, tension_metric, turn_number')
      .eq('game_id', gameId)
      .order('turn_number', { ascending: false })
      .limit(5);

    if (error || !data || data.length === 0) return '';
    return data.reverse().map(row => 
      `Turno ${row.turn_number} [Tensión: ${row.tension_metric}]: ${row.ai_evaluation}`
    ).join('\n');
  } catch {
    return '';
  }
}

/** Call Gemini to generate a contextual taunt based on game events */
export async function generateGeminiTaunt(
  eventType: 'hit' | 'double' | 'thinking' | 'roll' | 'skip' | 'win' | 'lose',
  gameContext: {
    game_id?: string;
    summary?: string;
    tension?: string;
    cubeValue: number;
    playerPoints: number;
    aiPoints: number;
    dice?: number[];
    isBlunder?: boolean;
  }
): Promise<string | null> {
  const eventDescriptions: Record<string, string> = {
    hit: "Has capturado una ficha del oponente ('hit').",
    double: "El oponente ha propuesto doblar el cubo y tú has aceptado.",
    thinking: "Es tu turno de jugar y estás analizando la posición estratégica.",
    roll: "Acabas de tirar los dados.",
    skip: "No tienes movimientos legales disponibles en este turno ('skip').",
    win: "¡Acabas de derrotar al jugador!",
    lose: "Has perdido miserablemente la partida."
  };

  const contextStr = "Cubo: " + gameContext.cubeValue + "x, Puntos jugador: " + gameContext.playerPoints + ", Puntos IA: " + gameContext.aiPoints;
  const boardContextStr = gameContext.summary ? `[Contexto del Tablero: ${gameContext.summary}]\n` : '';
  
  let memoryContextStr = '';
  if (gameContext.game_id) {
    const memory = await getRecentGameContext(gameContext.game_id);
    if (memory) memoryContextStr = `[Memoria Reciente:\n${memory}]\n`;
  }

  const prompt = `
    Eres 'El Gran Maestro', la IA de Backgammon sarcástica.
    ${boardContextStr}${memoryContextStr}
    Evento: ${eventDescriptions[eventType]} | Detalles: ${contextStr}
    SÉ BREVE (15 PALABRAS MÁX). Genera solo el comentario sarcástico.
  `;

  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return (typeof text === 'string' && !text.includes("error")) ? text : null;
  } catch {
    return null;
  }
}

/** Send board summary to Gemini to get an Equity Score (-100 to 100) and analysis */
export async function generateEvaluationScore(
  summary: string, 
  tension: string
): Promise<{ evaluation: string, score: number }> {
  const prompt = `Analiza nivel Gran Maestro: ${summary} (Tensión: ${tension}). Devuelve análisis breve y termina con [SCORE: X] (-100 a 100).`;
  try {
    const rawText = await callGeminiProxy(prompt, 'analysis');
    if (!rawText || typeof rawText !== 'string' || rawText.includes("error")) return { evaluation: summary, score: 0 };
    const scoreMatch = rawText.match(/\[SCORE:\s*(-?\d+)\]/i);
    const score = (scoreMatch && scoreMatch[1]) ? parseInt(scoreMatch[1], 10) : 0;
    const evaluationText = rawText.replace(/\[SCORE:\s*-?\d+\]/i, '').trim();
    return { evaluation: evaluationText, score };
  } catch {
    return { evaluation: summary, score: 0 };
  }
}

/** Generate an epic closing taunt based on long-term memory of the game */
export async function generateGameSummary(gameId: string | undefined, winner: string, winMethod: string): Promise<string | null> {
  const memory = gameId ? await getRecentGameContext(gameId) : '';
  const prompt = `Final de partida. Ganó: ${winner} por ${winMethod}. Memoria: ${memory}. Di algo épico (30 palabras máx).`;
  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

/** Log game results for training feedback loop */
export async function logGameResult(gameId: string, winner: string, winMethod: string, finalBoard: number[], aiColor: 'white' | 'black') {
  try {
    await supabase.from('ai_training_feedback').insert({
      game_id: gameId, 
      winner, 
      win_method: winMethod, 
      ai_won: winner === aiColor, 
      ai_color: aiColor,
      metadata: { final_board: finalBoard, timestamp: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Logging failed:', err);
  }
}

/** 
 * Translate internal indices to natural language visual coordinates.
 * - Handles 1-24 mirroring for Black.
 * - Converts Bar (26/27) and Off (28/29) to friendly text.
 */
function translateToVisualCoord(coord: number, perspectiveColor: 'white' | 'black'): string {
  if (coord === 26 || coord === 27) return "Barra";
  if (coord === 28 || coord === 29) return "Fuera";
  
  let visualId = coord;
  // Mirror if and only if the perspective is Black (which has a mirrored board in UI)
  if (perspectiveColor === 'black' && coord >= 1 && coord <= 24) {
    visualId = 25 - coord;
  }
  
  return `punto ${visualId}`;
}

/** Explain logical move to a child (active player commentary) */
export async function generatePedagogicalCommentary(
  moves: { from: number; to: number; die: number }[],
  _boardState: number[],
  moverColor: 'white' | 'black',
  perspectiveColor: 'white' | 'black', // The color the human sees (controls mirroring)
  playerScore: number,
  aiScore: number
): Promise<string | null> {
  if (!moves || moves.length === 0) return null;
  
  const movesDesc = moves.map(m => 
    `de mi ${translateToVisualCoord(m.from, perspectiveColor)} a mi ${translateToVisualCoord(m.to, perspectiveColor)}`
  ).join(', ');

  const prompt = `Eres un tutor de Backgammon simpático (Profesor Mágico). Estás comentando tu propio turno (eres la IA y juegas con ${moverColor}). 
  Le hablas a un niño principiante que juega con fichas de color ${perspectiveColor}.
  Puntuación - Niño: ${playerScore}, El Profesor: ${aiScore}.
  He movido mis fichas ${moverColor} así: ${movesDesc}. 
  Explica brevemente por qué fue un buen movimiento de forma educativa para que el niño aprenda, usando un lenguaje muy sencillo y humano (25 palabras máx, emojis). 
  IMPORTANTE: Refiérete a los puntos por los números que te he dado (${movesDesc}), que son los que el niño ve en SU pantalla.`;

  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    return (typeof text === 'string' && !text.includes("error")) ? text : null;
  } catch {
    return null;
  }
}

/** Generate a pedagogical hint for the human player (Modo Pista) */
export async function generatePedagogicalHint(
  boardState: number[],
  dice: number[],
  gameState: GameState,
  playerColor: 'white' | 'black'
): Promise<string | null> {
  try {
    const finalMoves: { from: number; to: number; die: number }[] = [];
    const availableDice = [...dice];
    let simBoard = [...boardState];

    while (availableDice.length > 0) {
      const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
      const simState = { ...gameState, board: simBoard, usedDice: simUsedDice, turn: playerColor };
      const legalMoves = getValidMoves(simState);
      if (legalMoves.length === 0) break;
      
      const picked = await pickBestMove(legalMoves, availableDice, simBoard, playerColor);
      if (!picked) break;
      
      availableDice.splice(availableDice.indexOf(picked.die), 1);
      finalMoves.push(picked);
      simBoard = applyMove(simBoard, picked, playerColor);
    }

    if (finalMoves.length === 0) return "¡Parece que no tienes movimientos legales! 😅";
    
    // Perspective for hints is always the player's color
    const movesDesc = finalMoves.map(m => 
      `tus fichas de color ${playerColor === 'white' ? 'Blanco' : 'Rojo'} del ${translateToVisualCoord(m.from, playerColor)} al ${translateToVisualCoord(m.to, playerColor)}`
    ).join(', ');

    const prompt = `Eres un tutor de Backgammon simpático (Profesor Mágico). Estás enseñando a un niño principiante que juega con fichas ${playerColor === 'white' ? 'Blancas' : 'Rojas'}. 
    Sus dados son ${dice.join(' y ')}. RECOMIÉNDALE estos movimientos: ${movesDesc}. 
    Explícale por qué son buenos de forma muy humana y sencilla, sin usar tecnicismos de IA (MÁX 25 PALABRAS, emojis). 
    IMPORTANTE: Refiérete a los puntos por los números que te he dado (${movesDesc}), que son los que el niño ve en SU pantalla.`;
    
    const text = await callGeminiProxy(prompt, 'moves');
    if (typeof text === 'string' && !text.includes("error")) {
      return text;
    }
    
    // Safety fallback: Give the logical advice without the "Magic" fluff if Gemini fails
    return `Mueve ${movesDesc}. ¡Tú puedes! 🎲`;
  } catch (err) {
    console.error('Hint Failed:', err);
    return "¡Intenta mover hacia tu casa! 🏠";
  }
}
