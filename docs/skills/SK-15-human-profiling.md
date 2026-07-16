# SK-15 · Psicología del Tablero Humano (Supabase Profiling)

> **Bloque 1 — Agente Historiador (Conexión con Supabase)**
> **Estado en el código:** ❌ No implementado (no hay perfilado por usuario)

## Objetivo

Adaptar la estrategia según los **puntos débiles del rival humano actual**:
¿es agresivo (come mucho) o seguro (asegura posiciones)?

## Procesamiento

1. Busca el historial del usuario contra el que se juega en Supabase.
2. Calcula su **Índice de Agresión**:
   ```
   ÍndiceAgresión = frecuencia_capturas / frecuencia_puntos_seguros
   ```
3. Clasifica al rival (pasivo / equilibrado / ultra-agresivo).

## Impacto

- Si el rival es **ultra-agresivo** → aumenta **+30% la penalización por dejar
  fichas solas** (refuerza SK-07 `calculateBlotRisk`).
- (Implícito) si es pasivo → la IA puede permitirse más blots y jugar una
  carrera más rápida.

## Estado actual

**No existe perfilado por `user_id`.** El evaluador es **genérico**: trata a
todos los rivales igual. El `whitePlayerId` / `blackPlayerId` *se guardan* en
`game_logs` (`api.ts:166-167`) y se pasan al worker (`GameOverRequest`), pero
nunca se leen para adaptar el juego.

```ts
// worker.ts — el ID del rival está disponible pero sin usar:
whitePlayerId?: string | null;
blackPlayerId?: string | null;
```

## Plan de integración

1. Crear `src/features/ai-worker/profiling.ts`:
   ```ts
   export interface RivalProfile {
     aggressionIndex: number;  // >1 agresivo, <1 pasivo
     label: 'pasivo' | 'equilibrado' | 'agresivo';
     sample: number;
   }
   export async function getRivalProfile(userId: string): Promise<RivalProfile | null>
   ```
   Consultando `game_history_analysis` + `game_logs` filtrando por
   `white_player_id`/`black_player_id` y contando hits vs. puntos hechos.
2. En `getBestMove` / `evaluatePosition`, aceptar un `profile` opcional y
   escalar el peso de blots:
   ```ts
   let blotRiskWeight = WEIGHTS.blotRisk;
   if (profile?.label === 'agresivo') blotRiskWeight *= 1.30; // +30%
   ```
3. El worker resolvería el perfil **una vez por partida** (no por movimiento)
   para evitar coste: al recibir el primer `GET_MOVE` con el `rivalId`.

## Dependencias

- **Entrada:** `white_player_id`/`black_player_id` (ya en `game_logs`),
  `game_history_analysis`.
- **Afecta a:** SK-07 (blots), indirectamente SK-05 (race) y SK-09 (hit).
- **Requiere:** pasar el `rivalId` en `GetMoveRequest` (hoy no viaja).

## Riesgos

- Perfil con poca muestra → fallback al perfil "equilibrado".
- Privacidad: el perfilado usa sólo datos de *esa* partida/tabla, no datos
  personales; cumple RLS existente.

## Nota estratégica

SK-15 convierte a la IA en un **oponente que te estudia**: tras unas pocas
partidas contra ti, sabe si sueles comer o asegurar, y contraataca. Es de las
skills de mayor "efecto rey del juego" percibido por el usuario.
