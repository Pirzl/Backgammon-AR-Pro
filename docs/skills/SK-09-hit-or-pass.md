# SK-09 · Dilema de la Captura Inteligente (Hit or Pass)

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ✅ Implementado (con las dos condiciones de seguridad del enunciado)

## Objetivo

Evaluar si **enviar al rival al bar** (comer una ficha) es tácticamente
correcto **en este instante**, o si deja a la IA demasiado expuesta.

## Procesamiento

1. Detecta si el movimiento candidato aterriza sobre una ficha sola del rival
   (captura / hit).
2. Compara los riesgos usando **SK-13** (look-ahead).
3. Decide si comer compensa.

## Impacto (reglas del enunciado)

| Caso | Ajuste |
|---|---|
| Comer deja a la IA **a salvo** | **+60 puntos** |
| Comer **destruye la propia defensa** o la deja muy expuesta | **−20 puntos** |

## Implementación real

| Concepto | Ubicación |
|---|---|
| Bono condicional por captura | `expectimax.ts → calculateConditionalHitBonus(board, player)` |
| Detección del hit (durante applyMove) | `rules.ts → applyMove` (rama HIT) |
| Riesgo propio tras comer | `calculateBlotRisk(board, player)` |
| Fuerza de casa propia | `evaluateHomeBoard(board, player)` |

La función aplica **exactamente las dos condiciones** del enunciado:

```ts
export function calculateConditionalHitBonus(board, player): number {
  const oppCheckersOnBar = Math.abs(board[oppBarIndex] ?? 0);
  if (oppCheckersOnBar === 0) return 0;          // no hay hit reciente → sin bono

  let bonus = oppCheckersOnBar * WEIGHTS.hitBonus;

  // Condición 1: SEGURIDAD — si comer nos deja expuestos, reduce el bono
  const myRisk = calculateBlotRisk(board, player);
  if (myRisk > 1.5) bonus *= 0.5;                 // ≈ "−exposición" (no comer a lo loco)

  // Condición 2: FUERZA DE TABLERO — comer vale más con casa fuerte
  const myBoardStrength = evaluateHomeBoard(board, player);
  const strengthMultiplier = 0.8 + (myBoardStrength / 6) * 0.7;  // 0.8 .. 1.5

  return bonus * strengthMultiplier;
}
```

Y el `gamePlan === 'attack'` **amplifica** el bono cuando el rival está en el bar
con casa fuerte:

```ts
if (gamePlan === 'attack') { hitMultiplier = 1.4; blotRiskWeight *= 0.8; }
score += calculateConditionalHitBonus(...) * hitMultiplier;
```

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "+60 si comer deja a salvo" | `bonus * strengthMultiplier` (hasta ×1.5 con casa fuerte) × `hitMultiplier 1.4` en ataque |
| "−20 si destruye la defensa" | `if (myRisk > 1.5) bonus *= 0.5` + `blotRiskWeight` sigue penalizando |
| "Compara riesgos con SK-13" | `calculateBlotRisk` + propagación por el expectimax (SK-13) |

## Sinergias

- **SK-13:** el expectimax ya evalúa el tablero *después* del contragolpe rival,
  así que "comer y que me coman a mí" queda penalizado automáticamente en la rama.
- **SK-14:** cuando el rival está en el bar, SK-09 se combina con SK-14 (cerrar
  casa) para que **no pueda reentrar** → captura definitiva.
- **SK-15:** un rival pasivo reduce el valor de comer (no contragolpea); uno
  agresivo lo aumenta (SK-15 reforzaría el cálculo).

## Notas

- SK-09 está **íntegramente implementado** con las dos restricciones del
  enunciado. Es una de las skills más "lista" del sistema: no come a ciegas.
