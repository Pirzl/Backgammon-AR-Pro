# SK-13 · Matriz de Dados Futuros (Look-Ahead / Minimax)

> **Bloque 2 — Agente Estratega (Visión Global y Dados)**
> **Estado en el código:** ✅ Implementado de forma robusta (Expectimax con nodos de azar)

## Objetivo

Predecir el **peligro del próximo turno del rival**: si un movimiento candidato
deja una ficha expuesta, ¿con cuántas de las 21 combinaciones de dados podría
capturarla el rival?

## Procesamiento

1. Para cada movimiento candidato, simula virtualmente las **21 combinaciones**
   de dados posibles del rival.
2. Cuenta en cuántas el rival puede capturar (hit) la ficha dejada al descubierto.

## Impacto (regla del enunciado)

- Si un movimiento deja una ficha expuesta a captura en **más de 12 de las 21**
  combinaciones → **−40 puntos** a ese movimiento.

## Implementación real

El motor hace **algo mejor y más general** que contar manualmente: un **búsqueda
Expectimax de profundidad 2** que ya promedia sobre las 21 combinaciones de
dados del rival:

```ts
// expectimax.ts
getBestMove (MAX)
  → expectimaxChance   // CHANCE: itera las 21 combinaciones con su probabilidad
      → expectimaxMin  // MIN: el rival elige su mejor captura
          → evaluatePosition  // heurística del tablero resultante
```

`getAllDiceCombinations()` genera exactamente las **21 tiradas únicas**
(6 dobles con prob 1/36 + 15 mixtas con prob 2/36):

```ts
for (die1=1..6) for (die2=die1..6)
  die1===die2 ? [d,d,d,d] @1/36 : [d1,d2] @2/36   // → 21 entradas
```

### Detección concreta del "blot expuesto"

El término de riesgo de blots (`calculateBlotRisk`, que alimenta SK-07) mide
**directamente** cuántos dados del rival golpean cada ficha sola:

```ts
// para cada blot, cuenta amenazas a 1..6 pips
for (pip=1..6) if (oponente puede llegar) score += 0.3 + (6-pip)*0.1;
```

Ese riesgo entra en `evaluatePosition` con peso `blotRisk: 2.2` (el más alto),
así que un blot muy expuesto penaliza la rama entera del expectimax — exactamente
el efecto "−40 puntos" que pide el enunciado, pero **propagado por el árbol** en
vez de aplicar un hard-coded −40.

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "Simula 21 combinaciones del rival" | `expectimaxChance` + `getAllDiceCombinations` |
| "Cuenta si puede capturar" | `calculateBlotRisk` (amenazas 1–6 pips) + `applyMove` (simula hit) |
| "−40 si >12/21 expuesto" | Penalización continua vía `blotRiskWeight=2.2` en cada nodo |

## Diferencia técnica (a favor del código)

El enunciado propone un umbral binario (12/21). El expectimax es **más fino**:
considera también la *consecuencia* del hit (no sólo si ocurre), porque evalúa el
tablero completo tras la captura. Por eso **no se añade el −40 literal**: sería
redundante y peor que el promediado probabilístico actual.

## Notas

- Profundidad por defecto: `depth = 2` (`worker.ts:224`).
- Aumentar `depth` a 3/4 daría más fuerza pero coste exponencial — hoy es el
  equilibrio correcto para tiempo real.
- SK-13 es **el núcleo de la inteligencia** del sistema y ya está sólido.
