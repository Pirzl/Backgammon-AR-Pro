# SK-02 · Filtro de Rendimiento Histórico (Win/Loss Matcher)

> **Bloque 1 — Agente Historiador (Conexión con Supabase)**
> **Estado en el código:** ⚠️ Parcial (infraestructura existe, heurística de +/- puntos NO conectada)

## Objetivo

Decidir el peso de un movimiento candidato basándose en el **éxito o fracaso
histórico** de jugadores humanos que llegaron a la misma posición.

## Procesamiento

1. Ejecuta una consulta a Supabase con la firma de SK-01 y los dados actuales.
2. Analiza los movimientos realizados en esas partidas históricas.
3. Ajusta la puntuación del movimiento candidato.

## Impacto (reglas de puntuación del enunciado)

| Resultado histórico del movimiento | Ajuste |
|---|---|
| Llevó a **Victoria** | **+50 puntos** a esa opción |
| Llevó a **Derrota** | **−100 puntos** (lista negra, no repetir) |

## Estado actual en el código

La **infraestructura de consulta ya existe**, pero la **lógica de +/-50/-100 NO
está aplicada** como término de puntuación:

| Pieza | Estado | Ubicación |
|---|---|---|
| Hash de posición (SK-01) | ✅ | `zobrist.ts → hashBoard` |
| Consulta de evaluación cacheada | ✅ | `api.ts → fetchEvaluation(hash)` |
| Tabla de historial por turno | ✅ | migración `20260221123456_create_game_history_analysis.sql` → `game_history_analysis` (campos `is_win_move`, `board_snapshot`) |
| Almacenamiento de resultado | ✅ | `api.ts → saveGameResult` (tabla `game_logs`) |
| **Ajuste +50/−100 en el evaluador** | ❌ **GAP** | Falta conectar con `expectimax.ts → evaluatePosition` |

## Plan de integración (cerrar el GAP)

1. Crear `src/features/ai-worker/historical.ts` con una función:
   ```ts
   export async function getHistoricalWinRate(
     hash: bigint,
     dice: number[]
   ): Promise<{ wins: number; losses: number; sample: number } | null>
   ```
   Consultando `game_history_analysis` filtrando por `board_snapshot` y
   `is_win_move`.
2. En `worker.ts → handleGetMove`, tras el cache miss (paso 4), mezclar el
   resultado del expectimax con el bias histórico **antes** de devolverlo:
   ```ts
   const hist = await getHistoricalWinRate(hash, state.dice);
   if (hist && hist.sample >= MIN_SAMPLE) {
     // +50 / -100 por candidato ganador/perdedor
   }
   ```
3. Umbral mínimo de muestra (`MIN_SAMPLE`, p. ej. 5 partidas) para no sesgar con
   ruido estadístico.

## Dependencias

- **Entrada:** SK-01 (hash).
- **Tablas:** `game_history_analysis`, `game_logs`.
- **Salida:** bias añadido al `value` que devuelve `getBestMove`.

## Riesgos

- Si la tabla histórica está vacía (proyecto nuevo), `getHistoricalWinRate`
  devuelve `null` y la IA cae gracefully al puro expectimax (SK-03 controla
  este caso).
