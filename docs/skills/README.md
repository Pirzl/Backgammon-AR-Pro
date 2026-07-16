# Skills del Motor de IA — Backgammon

Especificación independiente (un archivo `.md` por skill) de las 16 habilidades
que componen el cerebro del jugador IA, **mapeadas al código real** del proyecto.

> Objetivo del conjunto: que la IA **siempre intente ganar** y se convierta en
> "rey del juego" combinando memoria histórica (Supabase), visión estratégica
> y táctica de campo.

---

## Mapa rápido de estado

| Skill | Bloque | Estado | Archivo |
|---|---|---|---|
| SK-01 Board Hashing | Historiador | ✅ Implementado | [SK-01](SK-01-board-hashing.md) |
| SK-02 Win/Loss Matcher | Historiador | ⚠️ Parcial | [SK-02](SK-02-win-loss-matcher.md) |
| SK-03 Creative Deviation | Historiador | ❌ Falta | [SK-03](SK-03-creative-deviation.md) |
| SK-04 Root Move Analysis | Estratega | ✅ Implementado | [SK-04](SK-04-root-move-analysis.md) |
| SK-05 Win-Drive (Pip) | Estratega | ✅ Implementado | [SK-05](SK-05-win-drive.md) |
| SK-06 Timeline Scanner | Estratega | ✅ Implícito | [SK-06](SK-06-timeline-scanner.md) |
| SK-07 Blot Prevention | Táctico | ✅ Implementado | [SK-07](SK-07-blot-prevention.md) |
| SK-08 Blocks & Covers | Táctico | ✅ Implementado | [SK-08](SK-08-blocks-and-covers.md) |
| SK-09 Hit or Pass | Táctico | ✅ Implementado | [SK-09](SK-09-hit-or-pass.md) |
| SK-10 Optimized Bear-off | Táctico | ✅ Implementado | [SK-10](SK-10-optimized-bear-off.md) |
| SK-11 Self-Evolve | Historiador | ❌ Falta | [SK-11](SK-11-self-evolve-rules.md) |
| SK-13 Future Dice (Minimax) | Estratega | ✅ Implementado | [SK-13](SK-13-future-dice-minimax.md) |
| SK-14 Bar Lockdown | Táctico | ✅ Implementado | [SK-14](SK-14-bar-lockdown.md) |
| SK-15 Human Profiling | Historiador | ❌ Falta | [SK-15](SK-15-human-profiling.md) |
| SK-16 Landing Efficiency | Táctico | ⚠️ Parcial | [SK-16](SK-16-landing-efficiency.md) |

**Resumen:** 10 implementadas · 2 parciales · 4 pendientes (todas del bloque
Historiador, dependen de Supabase).

---

## Los 3 bloques funcionales

### 🏹 Bloque 1 — Agente Historiador (memoria + Supabase)
Aprende del pasado: hash de posición, win-rate histórico, innovación cuando el
histórico es malo, evolución del meta y perfilado del rival humano.
→ **SK-01, SK-02, SK-03, SK-11, SK-15**

### 🌐 Bloque 2 — Agente Estratega (visión global + dados)
Genera candidatos, decide el plan (carrera/bloqueo/ataque), detecta la fase y
mira adelante (expectimax sobre las 21 tiradas rivales).
→ **SK-04, SK-05, SK-06, SK-13**

### ⚔️ Bloque 3 — Agente Táctico (heurística de campo)
Evaluación concreta del tablero: blots, primos, capturas, bear-off, bloqueo de
bar y eficiencia de dados.
→ **SK-07, SK-08, SK-09, SK-10, SK-14, SK-16**

---

## Dónde vive cada cosa en el código

| Componente | Ubicación |
|---|---|
| Búsqueda Expectimax (SK-04/05/06/13) | `src/features/ai-worker/expectimax.ts` |
| Heurística táctica (SK-07/08/09/10/14) | `expectimax.ts → evaluatePosition` y helpers |
| Hash de tablero (SK-01) | `src/features/ai-worker/zobrist.ts` |
| Worker + memoria + aprendizaje | `src/features/ai-worker/worker.ts` |
| API Supabase (cache + game_logs) | `src/features/ai-worker/api.ts` |
| Reglas puras (movimientos, bear-off, hits) | `src/entities/game/rules.ts` |
| Constantes (índices bar/off/casas) | `src/entities/game/constants.ts` |
| Tipos (GameState, Move, PlayerColor) | `src/entities/game/types.ts` |
| Tabla historial por turno | `supabase/migrations/20260221123456_create_game_history_analysis.sql` |

---

## Hoja de ruta para "rey del juego"

Si se quiere **maximizar la fuerza** de la IA con el menor esfuerzo, por impacto
descendente:

1. **SK-02 + SK-03** (par cierra el lazo histórico) — mayor salto de fuerza
   percibida una vez haya datos en `game_history_analysis`.
2. **SK-15** (perfilado de rival) — efecto "la IA me estudia", altísimo valor
   percibido en partidas repetidas vs. el mismo humano.
3. **SK-11** (self-evolve) — adaptación al meta semanal.
4. **SK-16** (eficiencia de bear-off) — afinación fina de endgames.

Las 10 skills ya implementadas (Bloques 2 y 3 + SK-01) forman un motor
**expectimax con heurística completa** que ya juega correctamente y con
criterio; el siguiente nivel de fuerza viene de **conectar la memoria
histórica** (Bloque 1).
