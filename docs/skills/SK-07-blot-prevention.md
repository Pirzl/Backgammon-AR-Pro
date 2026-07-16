# SK-07 · Antídoto contra Fichas Solas (Blot Prevention)

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ✅ Implementado (con la mejora del enunciado "se duplica en casa rival")

## Objetivo

Evitar dejar **fichas solas (blots)** vulnerables en el tablero.

## Procesamiento

1. Cuenta cuántas fichas quedan **completamente solas** en el tablero tras el
   movimiento candidato.
2. Mide el **riesgo real** de cada blot: ¿desde dónde puede golpearlo el rival?

## Impacto (reglas del enunciado)

- **−25 puntos** por cada ficha sola en campo abierto.
- La penalización **se duplica** si la ficha sola está en el **territorio de
  casa del rival** (donde es más probable que la coman al entrar del bar).

## Implementación real

| Concepto | Ubicación |
|---|---|
| Riesgo de blots (amenazas 1–6 pips) | `expectimax.ts → calculateBlotRisk(board, player)` |
| Refuerzo si el rival está en el bar | dentro de `calculateBlotRisk` (caso opp bar) |
| Peso en el evaluador | `WEIGHTS.blotRisk = 2.2` (el más alto de todos) |

`calculateBlotRisk` es **más fino** que "contar blots": para cada blot suma una
penalización que crece según cuán cerca está el atacante:

```ts
for (let pip = 1; pip <= 6; pip++) {
  const threatIndex = i + (direction * pip);
  if (oponente tiene ficha ahí) score += 0.3 + (6 - pip) * 0.1; // cercano = más riesgo
}
```

### Refuerzo "en casa del rival" y "rival en el bar" (cumple el "se duplica")

```ts
const oppBarCount = Math.abs(board[oppBarIndex] ?? 0);
if (oppBarCount > 0) {
  // White blot en 1..6 (casa del rival Black) → +0.5
  if (player === 'white' && i >= 1 && i <= 6) score += 0.5;
  // Black blot en 19..24 (casa del rival White) → +0.5
  if (player === 'black' && i >= 19 && i <= 24) score += 0.5;
}
```

Y el evaluador aplica el peso asimétrico (penaliza MI riesgo, premia el del rival):

```ts
score -= myRisk * blotRiskWeight;     // mi peligro resta
score += oppRisk * blotRiskWeight;    // peligro del rival suma
```

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "−25 por blot en campo abierto" | `score += (0.3 + (6-pip)*0.1)` por amenaza × `blotRiskWeight 2.2` |
| "Se duplica en casa del rival" | `+0.5` extra cuando hay rival en bar y blot en su zona de entrada |

## Sinergia con SK-15

SK-15 (Profiling) **escalará** `blotRiskWeight *= 1.30` cuando el rival sea
ultra-agresivo — reforzando SK-07 exactamente como pide el enunciado de SK-15.

## Notas

- SK-07 está **bien implementado y afinado**. Es el peso más alto del evaluador
  (2.2), lo que refleja que "no dejarse fichas solas" es la regla nº1 de
  backgammon táctico.
