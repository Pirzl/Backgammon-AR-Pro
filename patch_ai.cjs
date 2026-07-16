const fs = require('fs');
let code = fs.readFileSync('src/features/game-board/ai-service.ts', 'utf8');

// 1. Replace getGrandmasterMove
const gmMoverStart = code.indexOf('export async function getGrandmasterMove(');
const recentContextStart = code.indexOf('// ─────────────────────────────────────────────────────────────\r\n// RECENT GAME CONTEXT (Spinal Cord Connection)');
if (recentContextStart === -1) {
  console.log("Could not find recent context start, checking LF");
}

const gmMoverStartLF = code.indexOf('export async function getGrandmasterMove(');
const recentContextStartLF = code.indexOf('// ─────────────────────────────────────────────────────────────\n// RECENT GAME CONTEXT (Spinal Cord Connection)');

const validEnd = Math.max(recentContextStart, recentContextStartLF);

let newMover = `export async function getGrandmasterMove(
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
          // Found a verified cached move. Proceeding to smart fallback for remaining dice
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
    // 100% Client-Side. No Colab. Perfect for InfinityFree static hosting.
    const finalMoves: { from: number; to: number; die: number }[] = [];
    const availableDice = [...dice];
    let simBoard = [...boardState];

    if (availableDice.length > 0 && gameState) {
      console.log(\`🤖 AI Engine: Calculating best local moves for dice [\${dice}]\`);
      
      while (availableDice.length > 0) {
        const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
        const simState = {
          ...gameState,
          board: simBoard,
          usedDice: simUsedDice,
        };
        
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
          best_move: finalMoves[0],
          equity: 0, 
          depth: 1
        }).catch(err => console.warn("🧠 AI Wisdom Sync Failed:", err));
      }
      
      console.log("🎲 Local Engine complete. Chosen moves:", finalMoves);
    }

    return { moves: finalMoves };

  } catch (error) {
    console.error("AI Logic Failed:", error);
    return null;
  }
}

`;

code = code.substring(0, gmMoverStartLF) + newMover + code.substring(validEnd);

// 2. Add Pedagogical Tutor generator
const pedagogicalFunction = `
// ─────────────────────────────────────────────────────────────
// CEREBRO PEDAGÓGICO (El Profesor Mágico)
// ─────────────────────────────────────────────────────────────

/**
 * Llama a Gemini para evaluar un movimiento matemáticamente perfecto escogido por el motor
 * local y explicárselo a un niño de 8 años con un tono divertido y educativo.
 */
export async function generatePedagogicalCommentary(
  moves: { from: number; to: number; die: number }[],
  boardState: number[],
  aiColor: 'white' | 'black',
  playerScore: number,
  aiScore: number
): Promise<string | null> {
  if (!moves || moves.length === 0) return null;

  const colorName = aiColor === 'black' ? 'NEGRAS' : 'BLANCAS';
  const diceUsed = moves.map(m => m.die).join(' y ');
  const moveDescriptions = moves.map(m => \`De \${m.from} a \${m.to}\`).join(', ');

  const prompt = \`
Eres un profesor de Backgammon muy simpático, paciente y divertido. 
Estás jugando contra un niño de 8 años. Tú juegas con las fichas \${colorName}.
El marcador va: Niño \${playerScore} - Tú \${aiScore}.

Acabas de tirar los dados (\${diceUsed}) y como experto, decidiste hacer estos movimientos perfectos:
\${moveDescriptions}

Tu tarea:
Habla en primera persona, dirígete al niño con cariño (usa emojis) y explícale POR QUÉ fue un buen movimiento de manera muy sencilla, para que él aprenda la estrategia subyacente (ej. "¡Hice una pared para que no pases!", "¡Moví mi ficha sola para protegerla!", "¡He sacado una ficha del tablero para ganar la carrera!").

REGLAS ESTRICTAS:
1. MÁXIMO 25 PALABRAS. Se muy conciso porque el niño tiene poco tiempo para leer.
2. NUNCA insultes. Eres alentador y amistoso.
3. Devuelve SOLO tu comentario, sin introducciones ni saludos pesados.
\`;

  try {
    const text = await callGeminiProxy(prompt, 'analysis');
    if (!text || typeof text !== 'string' || text.includes("error")) return null;
    return text;
  } catch (err) {
    console.error('El Profesor Mágico falló al conectar:', err);
    return null;
  }
}
`;

code = code + pedagogicalFunction;

fs.writeFileSync('src/features/game-board/ai-service.ts', code);
console.log("ai-service.ts patched successfully.");
