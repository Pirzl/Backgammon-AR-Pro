# SK-06 · Escáner de Línea Temporal (Fases del Juego)

> **Bloque 2 — Agente Estratega (Visión Global y Dados)**
> **Estado en el código:** ✅ Implementado (parcial, vía heurísticas) · **Rol:** Ajuste de pesos por fase

## Objetivo

Identificar el **momento cronológico** de la partida y ajustar los pesos de las
habilidades tácticas según la fase.

## Procesamiento

Clasifica el juego en:
- **Apertura** — pocas fichas movidas, contacto inicial.
- **Medio Juego** — fichas cruzadas, contacto intenso.
- **Cierre / Bear-off** — todas las fichas en casa.

## Impacto

Cambia los pesos de prioridad de las habilidades tácticas según la fase actual.

## Implementación real

No existe una función `getPhase()` explícita, pero el evaluador **deriva la fase
implícitamente** y ajusta pesos en consecuencia:

| Señal de fase | Detección en código | Efecto |
|---|---|---|
| Cierre / Bear-off | `allCheckersHome(board, player)` | `bearOffWeight = WEIGHTS.bearOff * 2` |
| Carrera pura (cierre sin contacto) | `isRaceMode(board)` | Evaluador de rama dedicada |
| Ataque (rival en bar + casa fuerte) | `getGamePlan() === 'attack'` | `hitMultiplier *= 1.4`, blots `× 0.8` |
| Bloqueo (tras primeros puntos) | `getGamePlan() === 'prime'` | `primeWeight *= 1.4` |
| Apertura/medio genérico | `getGamePlan() === 'mixed'` | pesos por defecto |

```ts
// evaluatePosition ya reescribe pesos según la fase detectada:
let primeWeight = WEIGHTS.prime;
if (gamePlan === 'prime') primeWeight *= 1.4;
// ...
const bearOffWeight = aiAllHome ? WEIGHTS.bearOff * 2 : WEIGHTS.bearOff;
```

## Mapeo al enunciado

- "Apertura" → `mixed` (pesos base).
- "Medio juego" → `prime`/`attack`/`holding` según estructura.
- "Cierre" → `race` + `bearOff * 2`.

## Posible mejora (opcional)

Si se quiere una fase **explícita y tipada** para depuración/UI:

```ts
type Phase = 'opening' | 'midgame' | 'bearoff';
function getPhase(board: number[], player: PlayerColor): Phase {
  if (allCheckersHome(board, player)) return 'bearoff';
  // heurística: % de fichas que han cruzado el medio
  ...
}
```

Hoy no es necesario: el sistema de pesos dinámicos por `gamePlan` + `allCheckersHome`
cumple la misma función. **SK-06 está cubierto funcionalmente.**
