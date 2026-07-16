# SK-03 · Reconocimiento de Desviación Creativa

> **Bloque 1 — Agente Historiador (Conexión con Supabase)**
> **Estado en el código:** ❌ No implementado (requiere SK-02 primero)

## Objetivo

Forzar a la IA a **improvisar** cuando los datos históricos son mediocres: si
todas las opciones registradas para una posición tienen un % de victoria bajo,
la IA deja de confiar en la memoria y razona en tiempo real.

## Procesamiento

1. Tras consultar Supabase (SK-02), calcula el **win-rate máximo** entre las
   opciones registradas para la posición actual.
2. Si ese win-rate `< 40%`, activa un flag **"Innovación"**.

## Impacto

- Reduce el peso de Supabase a **0** (ignora el bias histórico).
- Obliga a la IA a depender **100% de las habilidades heurísticas en tiempo
  real** (SK-04 a SK-16, principalmente el evaluador de `expectimax.ts`).

## Estado actual

**No existe ningún flag de innovación.** Hoy el flujo del worker es binario:

```
cache local → cache Supabase → compute (expectimax)
```

No hay capa que *descarte* un resultado de Supabase por ser estadísticamente
malo. La IA confía ciegamente en cualquier evaluación cacheada.

## Plan de integración

1. Depende de cerrar **SK-02** (necesitamos el win-rate agregado, no solo el
   `equity` puntual cacheado).
2. En `worker.ts → handleGetMove`, introducir un *gate* entre el paso 3 (cache
   Supabase) y el paso 4 (compute):

   ```ts
   const supabaseCached = await fetchEvaluation(hash);
   if (supabaseCached) {
     const winRate = await getMaxOptionWinRate(hash, state.dice); // de SK-02
     if (winRate !== null && winRate < CREATIVE_THRESHOLD) {
       // SK-03: IGNORAR cache, forzar compute heurístico
       console.log('[SK-03] Modo Innovación: histórico < 40%');
     } else {
       // usar cache normalmente
       setCached(hash, supabaseCached);
       return respond(supabaseCached);
     }
   }
   const { move, value } = await getBestMove(state, 2); // 100% heurístico
   ```

3. Constantes recomendadas:
   - `CREATIVE_THRESHOLD = 0.40`
   - `MIN_SAMPLE = 5` (heredado de SK-02; con poca muestra no se desactiva el
     histórico).

## Dependencias

- **Entrada:** SK-01 (hash), SK-02 (win-rate por opción).
- **Salida:** decisión binaria *usar memoria* vs *innovar*.

## Nota

Esta skill es el **mecanismo anti-sesgo** del sistema: evita que la IA repita
errores históricos sólo porque están cacheados. Es barata (una consulta más) y
de alto valor estratégico.
