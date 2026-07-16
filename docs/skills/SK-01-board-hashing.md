# SK-01 · Muestreo de Matriz de Tablero (Board Hashing)

> **Bloque 1 — Agente Historiador (Conexión con Supabase)**
> **Estado en el código:** ✅ Implementado · **Rol:** Infraestructura clave

## Objetivo

Convertir el estado visual del tablero en una **clave única** que sirva de `id`
para consultar/almacenar evaluaciones en Supabase.

## Procesamiento

1. Toma el array de las 24 casillas, el bar y las fichas fuera (`board: number[]`, índices 0–29).
2. Genera un hash compacto mediante **Zobrist XOR** de 64 bits.
3. Devuelve el `id` único de posición para la consulta SQL.

## Implementación real

| Concepto del enunciado | Ubicación real |
|---|---|
| Tabla Zobrist 26 puntos × 31 valores | `src/features/ai-worker/zobrist.ts` → `initializeZobrist()` |
| Hash del tablero completo | `src/features/ai-worker/zobrist.ts` → `hashBoard(board)` |
| Actualización incremental tras movimiento | `src/features/ai-worker/zobrist.ts` → `hashMove(hash, move, board)` |
| Generador aleatorio de 64 bits (Web Crypto) | `zobrist.ts` → `randomBigInt64()` |

### Ejemplo de formato interno

El enunciado sugiere un string compacto tipo `W2-0-0-0-0-B5...`. El código usa
un entero BigInt (más eficiente y libre de colisiones), pero el efecto funcional
es idéntico: una clave única por posición.

```ts
const board = [0, -2, 0, 0, 0, 0, 5, ...];  // INITIAL_BOARD
const hash = hashBoard(board);              // → 18014398509481985n (BigInt)
// Se persiste como string en Supabase: "id::text"
```

## Seguridad BigInt (crítico)

Postgres `BIGINT` es entero con signo de 64 bits; `Number` de JS sólo tiene 53
bits de precisión. El flujo correcto (ya aplicado en `api.ts`):

```ts
const hashStr = BigInt.asIntN(64, hash).toString();
// Se pasa como string a .eq('id', hashStr) → PostgREST compara sin pérdida.
```

## Dependencias

- **Salida consumida por:** SK-02 (Win/Loss Matcher), SK-03 (Desviación Creativa),
  SK-11 (Self-Evolve), SK-15 (Profiling), y por el worker (`handleGetMove`).
- **Tablas Supabase:** `zobrist_evaluations` (cache de evaluaciones),
  `game_history_analysis` (historial por turno), `game_logs` (resultados).

## Notas de mantenimiento

- `initializeZobrist()` debe llamarse **una sola vez** al arrancar el worker
  (ya lo hace `worker.ts:30`).
- `resetZobrist()` se reserva para tests deterministas — **nunca** en producción,
  pues invalidaría todos los hashes almacenados en Supabase.
