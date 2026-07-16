# SK-14 · Gestión del "Bar" y Bloqueo de Retorno

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ✅ Implementado

## Objetivo

**Asfixiar al rival** cuando tiene fichas capturadas en el Bar: cerrarle las
casillas de casa para que no pueda reentrar al juego.

## Procesamiento

1. Cuenta cuántas fichas del rival están en el Bar.
2. Si hay al menos una, analiza **tu cuadrante de casa** (casillas 19–24 para
   el rival White; 1–6 para el rival Black).

## Impacto (reglas del enunciado)

- **+45 puntos** a cualquier movimiento que **cierre una casilla libre** en tu
  casa. Cuantas más casillas cierres, más difícil le será al rival entrar.

## Implementación real

| Concepto | Ubicación |
|---|---|
| ¿Rival en el bar? | `board[oppBarIndex]` (vía `getBarIndex`) |
| Recompensa por rival en el bar | `expectimax.ts → evaluatePosition` (rama `oppBarCount > 0`) |
| Fuerza de casa propia | `evaluateHomeBoard(board, aiPlayer)` |
| Plan "attack" cuando hay rival en bar + casa fuerte | `getGamePlan === 'attack'` |

El evaluador premia tener al rival en el bar **proporcionalmente a la fuerza de
tu casa** — que es justo la traducción de "cierra casillas":

```ts
if (oppBarCount > 0) {
  const myHomeStrength = evaluateHomeBoard(board, aiPlayer);
  score += oppBarCount * (1.5 + myHomeStrength * 0.5);  // casa más cerrada = más bonus
}
```

Y al revés, **penaliza** tener fichas propias en el bar según la fuerza de la
casa rival (lo difícil que será reentrar):

```ts
if (myBarCount > 0) {
  const oppHomeStrength = evaluateHomeBoard(board, oppPlayer);
  score -= myBarCount * (3 + oppHomeStrength);   // castigo fuerte
}
```

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "Cuenta fichas del rival en el Bar" | `oppBarCount = abs(board[oppBarIndex])` |
| "Analiza tu cuadrante de casa" | `evaluateHomeBoard(board, aiPlayer)` |
| "+45 por cerrar casilla libre" | `oppBarCount * (1.5 + myHomeStrength * 0.5)` — crece con cada punto hecho |
| Plan ofensivo asociado | `getGamePlan === 'attack'` activa `hitMultiplier *= 1.4` |

## Sinergias

- **SK-09:** comer (poner al rival en el bar) dispara SK-14.
- **SK-08:** cada punto hecho en casa sube `evaluateHomeBoard`, que amplifica
  el bono de SK-14 → motivo extra para construir casa.
- **SK-13:** el expectimax evalúa si el rival logra reentrar; si la casa está
  cerrada, la rama de reentrada no existe → valor muy alto para la IA.

## Notas

- Esta skill es la combinación letal: **comer + cerrar casa = ficha rival
  secuestrada**. Cada turno que el rival no entra, su pip count virtual sube 25.
- SK-14 está bien implementado vía los términos de `oppBarCount`/`myBarCount` y
  el plan `attack`.
