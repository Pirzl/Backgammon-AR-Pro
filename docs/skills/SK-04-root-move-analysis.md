# SK-04 · Análisis de Movimientos de Raíz

> **Bloque 2 — Agente Estratega (Visión Global y Dados)**
> **Estado en el código:** ✅ Implementado · **Rol:** Generador de candidatos

## Objetivo

Desglosar la tirada actual de dados en **todas sus ramificaciones legales**.
Es el motor que produce la lista de "Tableros Candidatos" que el resto de
skills van a puntuar.

## Procesamiento

1. Calcula matemáticamente qué fichas se pueden mover con el dado A, cuáles con
   el B, y las combinaciones de ambos (o los 4 movimientos si son dobles).
2. Respeta reglas obligatorias: entrada desde el bar primero, sin bloqueos, etc.
3. Devuelve la lista de `Move[]` candidatas.

## Implementación real

| Concepto | Ubicación |
|---|---|
| Dados disponibles (descontando usados) | `rules.ts → getAvailableDice(dice, usedDice)` |
| Validación de un movimiento | `rules.ts → isValidMove(state, move)` |
| Enumeración de todos los movimientos legales | `rules.ts → getValidMoves(state)` |
| Aplicación de un movimiento (con captura) | `rules.ts → applyMove(board, move, player)` |
| Reglas de bear-off (exacto / sobre-portar) | `rules.ts → canBearOff(...)` |

El expectimax consume esta lista en `expectimax.ts → getBestMove`:

```ts
const validMoves = getValidMoves(state);   // SK-04: lista de candidatos
if (validMoves.length === 0) return { move: null, value: evaluatePosition(...) };
if (validMoves.length === 1) return { move: validMoves[0]!, value: 0 }; // atajo
// ... itera y puntúa cada uno
```

## Casos cubiertos

- **Bar obligatorio:** `isValidMove` rechaza cualquier `from` distinto del bar
  si hay fichas en el bar.
- **Dobles:** `getAvailableDice` mantiene los 4 valores; `getValidMoves` itera
  sobre ellos.
- **Bloqueo del destino:** destino con ≥2 fichas rivales → inválido.
- **Bear-off:** sólo si `allCheckersHome`; respeta la regla del "dado alto para
  la casilla más lejana".

## Notas

- `getValidMoves` devuelve movimientos **individuales** (un dado). El encadenamiento
  de varios dados en un turno lo gestiona la capa superior que llama al worker
  repetidamente o el bucle de turnos de `game-board`.
- SK-04 es **prerrequisito de todo**: sin candidatos no hay nada que puntuar.
  Está sólido y no requiere cambios para el objetivo "rey del juego".
