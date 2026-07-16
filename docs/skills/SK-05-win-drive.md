# SK-05 · Obsesión por la Victoria (Win-Drive)

> **Bloque 2 — Agente Estratega (Visión Global y Dados)**
> **Estado en el código:** ✅ Implementado · **Rol:** Decisor de plan estratégico

## Objetivo

Priorizar la **seguridad o el ataque** según quién va ganando la carrera de
pip count. La IA no juega igual cuando va ganando que cuando va perdiendo.

## Procesamiento

1. Calcula el **Pip Count** de ambos jugadores (suma de pasos para sacar todas
   las fichas).
2. Compara: ¿la IA va por delante (menor pip) o por detrás?

## Impacto (reglas del enunciado)

| Situación | Comportamiento |
|---|---|
| IA **ganando** la carrera (pip menor) | **Penaliza** movimientos arriesgados → juega seguro |
| IA **perdiendo** (pip mayor) | **Premia** la creación de bloqueos avanzados para atrapar al rival |

## Implementación real

| Concepto | Ubicación |
|---|---|
| Pip count de un jugador (con bar × 25) | `expectimax.ts → calculatePipCount(board, player)` |
| Diferencia de pip (yo − rival) | `expectimax.ts → calculatePipDiff(board, player)` |
| Clasificación del plan de juego | `expectimax.ts → getGamePlan(board, player)` → `'race' \| 'prime' \| 'attack' \| 'holding' \| 'mixed'` |
| Modo carrera sin contacto | `expectimax.ts → isRaceMode(board)` |

### Cómo se materializa el impacto

En `evaluatePosition`, el `gamePlan` **reescribe los pesos** antes de puntuar:

```ts
if (gamePlan === 'prime')   { primeWeight *= 1.4; pipWeight *= 0.7; }   // detrás → bloquear
else if (gamePlan === 'attack')  { hitMultiplier = 1.4; blotRiskWeight *= 0.8; }
else if (gamePlan === 'holding') { anchorWeight *= 1.4; }
// 'race' (ganando) ya salió antes con bearOff reforzado y pip muy penalizado
```

Y en **race mode puro** (sin contacto posible) el evaluador refuerza el bear-off:

```ts
const bearOffWeight = aiAllHome ? WEIGHTS.bearOff * 2 : WEIGHTS.bearOff;
score += (aiBornOff - oppBornOff) * bearOffWeight;
```

## Mapeo al enunciado

- "IA ganando → penaliza riesgo" ⟶ `isRaceMode`/`gamePlan='race'` aumenta el
  peso de pip y bear-off, reduciendo effective riesgo.
- "IA perdiendo → premia bloqueos avanzados" ⟶ `gamePlan='prime'` sube
  `primeWeight *= 1.4` (alimenta SK-08).

## Notas

- El signo del pip diff está bien definido: **positivo = voy detrás (mal)**,
  negativo = voy adelantado (bien).
- Esta skill es el **interruptor maestro** que dice a las skills tácticas
  (Bloque 3) cuánto pesar cada cosa. Funciona y está afinada.
