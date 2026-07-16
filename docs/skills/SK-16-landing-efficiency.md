# SK-16 · Eficiencia en el Desembarque

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ⚠️ Parcial (reglas de bear-off sí; afinación de "no desperdiciar el dado grande" NO explícita)

## Objetivo

Evitar **desperdiciar el valor de los dados grandes** en la fase final:
distribuir el bear-off para que no queden "huecos altos" que hagan perder
movimientos futuros.

## Procesamiento

1. Al sacar fichas, calcula la distribución óptima.
2. Evita quedarse con fichas en puntos altos (6, 5) sin poder usar un dado alto
   eficientemente.

## Impacto (regla del enunciado)

- Si sale un **dado 6**, añadir **+15 puntos** a la acción de **sacar la ficha
  directamente del punto 6** en lugar de mover una ficha del 6 al 2.

## Estado actual

Las **reglas de bear-off** (`rules.ts → canBearOff`) están correctas y respetan
la regla del "dado alto para la casilla más lejana". Pero la **preferencia
táctica de no desperdiciar dados grandes** NO es un término explícito del
evaluador.

Hoy el evaluador, en fase de bear-off, puntúa por `(aiBornOff - oppBornOff)` y
por pip count, pero **no diferencia** entre:
- (A) usar un 6 para sacar del punto 6 (eficiente), frente a
- (B) usar un 6 para mover 6→2 (deja el punto 6 vacío y "gasta" el dado sin
  retirar ficha).

El expectimax, al mirar 1-2 turnos adelante, **parcialmente** prefiere (A) porque
reduce el pip count más y acerca el `+100` terminal — pero no de forma dirigida.

## Plan de integración (cerrar el GAP)

Añadir un término fino en `evaluatePosition` cuando `aiAllHome`:

```ts
if (aiAllHome) {
  // SK-16: penaliza "huecos altos" que desperdiciarían dados grandes futuros
  const [homeStart, homeEnd] = getHomeBoard(aiPlayer);
  let smoothnessPenalty = 0;
  for (let p = homeStart; p <= homeEnd; p++) {
    const count = Math.abs(board[p] ?? 0);
    const isOurs = /* signo correcto */;
    // si hay fichas en un punto alto pero los puntos más bajos están vacíos
    // → estructura "con huecos", propensa a desperdiciar dados
    ...
  }
  score -= smoothnessPenalty * SMOOTHNESS_WEIGHT; // p. ej. 0.3
}
```

Y, más directo, **premiar el bear-off con el dado exacto** en el generador de
candidatos: el expectimax ya recibe ambos candidatos (sacar vs. mover), bastaría
con añadir un pequeño `+ bonus` cuando `move.to === offIndex && move.die === punto`.
Esto es lo más fiel al "+15 puntos" del enunciado.

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "Reglas de bear-off correctas" | ✅ `canBearOff` (exacto + sobre-portar + dado alto) |
| "No desperdiciar dado grande" | ⚠️ implícito vía pip count/expectimax, **no explícito** |
| "+15 por sacar del punto 6 con un 6" | ❌ GAP — añadir término de suavizado/eficiencia |

## Dependencias

- **Entrada:** `allCheckersHome`, `getHomeBoard`, `WEIGHTS.bearOff`.
- **Relacionada:** SK-10 (prioridad de bear-off), SK-13 (look-ahead).

## Notas

- Es una skill de **afinación fina**. No es la que más fuerza añade, pero sí la
  que evita pérdidas tontas en endgames ajustados — precisamente donde se decide
  "ser rey del juego".
- De las 16 skills, SK-16 es **la única del Bloque 3 con un GAP real** en el
  código táctico.
