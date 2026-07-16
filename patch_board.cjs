const fs = require('fs');
let code = fs.readFileSync('src/features/game-board/ui/GameBoard.tsx', 'utf8');

// 1. Add import
code = code.replace(
  "import { generateGameSummary, getGrandmasterMove, generateGeminiTaunt, logGameResult } from '../ai-service';",
  "import { generateGameSummary, getGrandmasterMove, generateGeminiTaunt, logGameResult, generatePedagogicalCommentary } from '../ai-service';"
);

// 2. Insert Pedagogical logic
const insertTarget = "// 5. TURN COMPLETION: If some moves were skipped";
const pedagogicalBlock = `// ─── CEREBRO PEDAGÓGICO (El Profesor Mágico) ───
              if (geminiTauntsEnabled) {
                 const currentWallet = wallet?.saldo_actual ?? 500;
                 generatePedagogicalCommentary(
                   aiResponse.moves,
                   currentBoard,
                   currentState.turn || 'black',
                   currentWallet,
                   500
                 ).then(pedagogicalTaunt => {
                   if (pedagogicalTaunt) {
                     setTauntMessage(pedagogicalTaunt);
                     setShowTaunt(true);
                     setTimeout(() => setShowTaunt(false), 7000); // Dar tiempo a leer
                   }
                 }).catch(err => console.error("Error en Profesor Mágico:", err));
              }

              // 5. TURN COMPLETION: If some moves were skipped`;

code = code.replace(insertTarget, pedagogicalBlock);

fs.writeFileSync('src/features/game-board/ui/GameBoard.tsx', code);
console.log("GameBoard.tsx patched with Pedagogical Brain.");
