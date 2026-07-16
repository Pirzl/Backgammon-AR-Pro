# SK-10 · Evacuación Masiva de Fichas (Optimized Bear-off)

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ✅ Implementado (con activación "las 15 fichas en casa")

## Objetivo

Sacar las fichas del tablero **lo más rápido posible** en la fase final para
ganar la carrera.

## Procesamiento

1. Se activa **únicamente** cuando las 15 fichas están en el cuadrante de casa
   (casillas 1–6 para White, 19–24 para Black).
2. Prioriza de manera **absoluta** sacar fichas fuera del tablero en lugar de
   moverlas dentro de la misma casa.

## Impacto (reglas del enunciado)

- **+80 puntos** por cada ficha retirada (bear-off), garantizando terminar a
  la máxima velocidad.

## Implementación real

| Concepto | Ubicación |
|---|---|
| ¿Todas las fichas en casa? | `rules.ts → allCheckersHome(board, player)` |
| Validación de bear-off | `rules.ts → canBearOff(...)` |
| Generación de movimientos de bear-off | `rules.ts → getValidMoves` (rama bear-off) |
| Bono por sacar ficha | `expectimax.ts → evaluatePosition` (rama race / bear-off) |

El activador es **exactamente** el del enunciado:

```ts
const aiAllHome = allCheckersHome(board, aiPlayer);   // "las 15 en casa"
```

Y la recompensa se **duplica** cuando se da esa condición, tanto en race mode
como en el evaluador general:

```ts
// Rama race mode:
const bearOffWeight = aiAllHome ? WEIGHTS.bearOff * 2 : WEIGHTS.bearOff;
score += (aiBornOff - oppBornOff) * bearOffWeight;   // cada ficha fuera suma fuerte

// Evaluador general:
score += (aiBornOff - oppBornOff) * 0.5;
// + terminal win check:
if (aiBornOff === 15) return 100.0;   // ¡victoria!
```

Además `canBearOff` fuerza la **regla del dado más alto** ("si el dado excede el
punto, sólo puedes sacar desde la casilla más lejana con ficha"), evitando movimientos
de bear-off ilegales que retrasarían la victoria.

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "Sólo cuando las 15 están en casa" | `allCheckersHome` gatea tanto el bear-off como `bearOffWeight * 2` |
| "+80 por ficha retirada" | `(aiBornOff - oppBornOff) * (bearOff * 2)` + terminal `+100` al llegar a 15 |
| "Prioridad absoluta de sacar" | rama `race` dedicada + `WEIGHTS.bearOff = 1.5` |

## Sinergia con SK-16

SK-16 afina **qué ficha** sacar para no desperdiciar dados grandes. SK-10 decide
**cuándo** priorizar sacar. Juntas optimizan el cierre.

## Notas

- El evaluador da **+100 terminal** al borne-off completo y **−100** si lo logra
  el rival → la IA nunca "se relaja" cerca del final.
- SK-10 está sólido. Es la skill que cierra partidas y por tanto la que
  materialmente "gana el juego".
