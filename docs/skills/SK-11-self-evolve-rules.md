# SK-11 · Inyección Dinámica de Reglas (Self-Evolve)

> **Bloque 1 — Agente Historiador (Conexión con Supabase)**
> **Estado en el código:** ❌ No implementado (los multiplicadores son estáticos)

## Objetivo

Ajustar el **estilo de juego** de la IA según las **tendencias globales** que
se observan en Supabase: qué casillas están dando más victorias *esta semana*.

## Procesamiento

1. Escanea de forma **asíncrona** las últimas partidas ganadas en Supabase.
2. Detecta qué casillas (p. ej. la 5 o la 20) aparecen con más frecuencia en
   posiciones ganadoras en la ventana temporal reciente.
3. Modifica dinámicamente los **multiplicadores de las skills de bloqueo**
   (SK-08: `calculatePrimeScore`).

## Estado actual

El evaluador usa `WEIGHTS` **constantes en tiempo de compilación**
(`expectimax.ts:15-25`). No hay ningún mecanismo que los reescriba en runtime:

```ts
const WEIGHTS = {
  pipCount: -0.8,
  prime: 1.0,     // ← estático, SK-11 lo haría dinámico
  blotRisk: 2.2,
  bearOff: 1.5,
  ...
};
```

## Plan de integración

1. Convertir `WEIGHTS` en un objeto **mutable** cargado en memoria del worker:
   ```ts
   export let activeWeights = { ...WEIGHTS };
   ```
2. Crear `src/features/ai-worker/self-evolve.ts`:
   ```ts
   export async function refreshHotSpots(): Promise<void> {
     // SELECT point_index, COUNT(*) FROM game_history_analysis
     // JOIN game_logs ON winner ... WHERE created_at > now() - interval '7 days'
     // GROUP BY point_index ORDER BY count DESC LIMIT 3
     // → actualiza activeWeights.prime *= multiplicador
   }
   ```
3. Ejecutar el refresco **asíncrono** (no en el camino crítico del movimiento):
   - Al arrancar el worker.
   - Cada N partidas o cada X minutos (p. ej. `setInterval(refreshHotSpots, 30 * 60 * 1000)`).
4. SK-08 (`calculatePrimeScore`) leería `activeWeights.prime` en vez de la
   constante.

## Dependencias

- **Entrada:** SK-01, tablas `game_history_analysis` + `game_logs`.
- **Afecta a:** SK-08 (bloqueos), potencialmente SK-05 (race) y SK-07 (blots).
- **Necesita:** agregación SQL por `point_index` y ventana temporal.

## Riesgos

- Sobre-ajuste a una semana atípica → usar ventana móvil de 7 días y suavizado
  (media móvil con el peso anterior).
- Coste de la consulta → cachear el resultado en memoria durante el intervalo.

## Nota estratégica

Esta es la skill que hace que la IA **evolucione con el meta del juego**. Sin
ella, la IA juega igual contra un campo de rivales que cambia. Con ella, "se
convierte en rey del juego" porque adapta su estilo a lo que está ganando.
