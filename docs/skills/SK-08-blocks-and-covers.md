# SK-08 · Configuración de Bloqueos y Coberturas

> **Bloque 3 — Agente Táctico (Heurística de Campo)**
> **Estado en el código:** ✅ Implementado (con bono Prime no lineal)

## Objetivo

Crear **estructuras fuertes**: puntos seguros con 2+ fichas, y especialmente
**Primes** (6 puntos seguidos que bloquean al rival por completo).

## Procesamiento

1. Evalúa cuántas casillas pasan de 1 ficha (vulnerable) a 2+ fichas (bloqueada)
   gracias al movimiento.
2. Detecta secuencias consecutivas de puntos hechos.

## Impacto (reglas del enunciado)

- **+30 puntos** por cada nuevo punto seguro creado.
- **+50 puntos** si se logra un **Prime** (6 puntos seguros seguidos).

## Implementación real

| Concepto | Ubicación |
|---|---|
| Puntuación de primos (cadenas de puntos hechos) | `expectimax.ts → calculatePrimeScore(board, player)` |
| Puntos en casa (estructura) | `expectimax.ts → evaluateHomeBoard(board, player)` |
| Checkers rivales atrapados tras el prime | `expectimax.ts → countTrappedCheckers(board, player)` |

`calculatePrimeScore` **premia progresivamente** las cadenas, de forma
**no lineal** (cuanto más largo el prime, más vale):

```ts
if (consecutive === 3) score += 0.5;
else if (consecutive === 4) score += 1.2;
else if (consecutive === 5) score += 2.0;
else if (consecutive >= 6) score += 4.0;   // PRIME completo: bono máximo
```

Y, además, el evaluador **cuenta cuántas fichas rivales quedan atrapadas**
detrás del prime:

```ts
const trappedOpp = countTrappedCheckers(board, aiPlayer);
if (trappedOpp > 0) score += trappedOpp * 0.4;  // valor real del prime = rival asfixiado
```

## Mapeo al enunciado

| Enunciado | Código |
|---|---|
| "+30 por nuevo punto seguro" | `evaluateHomeBoard` (cuenta puntos hechos) + término `primeScore` |
| "+50 por Prime de 6" | `consecutive >= 6 → +4.0` escalado por `primeWeight` (que sube a `×1.4` en plan `prime`) |
| Efecto real del prime | `countTrappedCheckers` → bonus extra por rival bloqueado |

## Sinergia con SK-11 (Self-Evolve)

SK-11 **reescribe** `primeWeight` en runtime según qué casillas ganan más partidas
esa semana. Hoy el peso es la constante `WEIGHTS.prime = 1.0`; con SK-11 pasaría
a ser dinámico, potenciando SK-08.

## Notas

- Los valores del enunciado (+30/+50) y del código (0.5/1.2/2.0/4.0) están en
  **escalas distintas** pero conceptualmente alineados: el código recompensa
  más los primes largos y añade el efecto de "rival atrapado", que es lo que de
  verdad hace ganar un prime.
- SK-08 es **central** para el plan `prime` (SK-05/SK-06). Sólido.
