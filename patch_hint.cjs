const fs = require('fs');
let code = fs.readFileSync('src/features/game-board/ai-service.ts', 'utf8');

const pedagogicalHintFunction = `
// ─────────────────────────────────────────────────────────────
// CEREBRO PEDAGÓGICO: MODO ENTRENADOR (Pista)
// ─────────────────────────────────────────────────────────────

/**
 * Calcula el mejor movimiento para el jugador humano y pide a Gemini que lo
 * explique de manera didáctica y amigable (Modo Pista).
 * No ejecuta el movimiento, solo devuelve el texto sugerido.
 */
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

    // Simula qué haría el Cerebro Lógico si fuera el humano
    while (availableDice.length > 0) {
      const simUsedDice = [...gameState.usedDice, ...finalMoves.map(m => m.die)];
      const simState = { ...gameState, board: simBoard, usedDice: simUsedDice };
      
      const legalMoves = getValidMoves(simState);
      if (legalMoves.length === 0) break;
      
      // Llamamos a pickBestMove como si fuéramos el jugador actual
      const picked = await pickBestMove(legalMoves, availableDice, simBoard, playerColor);
      if (!picked) break;
      
      availableDice.splice(availableDice.indexOf(picked.die), 1);
      finalMoves.push({ from: picked.from, to: picked.to, die: picked.die });
      simBoard = applyMove(simBoard, picked, playerColor);
    }

    if (finalMoves.length === 0) {
      return "¡Parece que no tienes movimientos legales disponibles con estos dados! 😅";
    }

    const moveDescriptions = finalMoves.map(m => \`De \${m.from} a \${m.to}\`).join(', ');

    const prompt = \`
Eres el Profesor Mágico de Backgammon, un tutor muy simpático y paciente.
El jugador (humano) te ha pedido ayuda (una pista). 
Sus dados son \${dice.join(' y ')}. 
Tú, como Maestro, has calculado que la jugada perfecta es: \${moveDescriptions}.

Tu tarea:
Háblale directamente al jugador con mucha energía positiva (usa emojis). 
Sugiere que haga esos movimientos y explícale POR QUÉ son estratégicamente buenos (ej. "¡Te recomiendo mover así para bloquear el paso de las fichas enemigas!", "¡Con esto aseguras tu ficha y avanzas rápido!").

REGLAS ESTRICTAS:
1. MÁXIMO 30 PALABRAS. Se muy conciso porque el niño tiene poco tiempo para leer.
2. Eres un tutor, no un oponente. Sé amistoso.
3. Devuelve SOLO tu consejo, sin saludos largos.
\`;

    const text = await callGeminiProxy(prompt, 'analysis');
    if (!text || typeof text !== 'string' || text.includes("error")) return "Mi bola de cristal está nublada, ¡pero confío en tu instinto! ✨";
    
    return text;
  } catch (err) {
    console.error('El Profesor Mágico falló al generar pista:', err);
    return "Mi bola de cristal está nublada, ¡pero confío en tu instinto! ✨";
  }
}
`;

code = code + pedagogicalHintFunction;
fs.writeFileSync('src/features/game-board/ai-service.ts', code);
console.log("ai-service.ts patched with generatePedagogicalHint.");
