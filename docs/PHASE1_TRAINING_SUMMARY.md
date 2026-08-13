# Phase 1 — AI Training Pipeline (Self-Play) — Hand-off Summary

Date: 2026-08-13
Branch: `260813-fix-selfplay-td` (NOT merged to master, NOT deployed)
Commit base: `bbab63e` (master)

## 1. Goal

Make the pure NN win >= 60% of full games vs the static heuristic in a head-to-head
tournament, from a 24% baseline. The gate is measured by `runTournament()`
(red = pure NN, blue = pure heuristic, random color + first player per game).

## 2. What changed (6 files, all in this branch)

| File | Role |
|------|------|
| `src/features/ai-worker/training/move-picker.ts` | NEW. `pickBestFullTurn()`: enumerates legal full-turn sequences (capped deterministically by board+dice), scores ALL of them with ONE batched evaluator call, epsilon-greedy optional. Shared by self-play and tournament so both sides score the same candidate set. |
| `src/features/ai-worker/training/self-play.ts` | Rewritten runner. Full turns, real outcome labels, cycle-breaker (forced random move on position recurrence), configurable `blend`/`opponent`/`label`/`exploration`. Callback in `runForever` is now AWAITED (fixes tfjs concurrent-fit crash). |
| `src/features/ai-worker/training/cli.ts` | Headless training CLI (tsx). Flags: `--games --opponent=self\|heuristic --label=td0\|outcome --self-play-blend --exploration --max-moves --max-sequences --epochs --eval-every --eval-games --nn-blend --save-every`. On-policy: fits each finished game's positions only. |
| `src/features/ai-worker/training/tournament.ts` | `runTournament()` exportable, default PURE NN (`NN_BLEND=1.0`), random color + first player. Honest gate. |
| `src/features/ai-worker/nn-model.ts` | `trainOnGame(examples, epochs)` with a fit-queue mutex (serializes tfjs `LayersModel.fit`), added `evaluateBatch()` (one forward pass for many boards). Architecture unchanged: `198→40→1` tanh. |
| `src/entities/game/full-turn-generator.ts` | Added `maxSequences` cap to `generateAllTurnSequences`. |

## 3. How to run

```bash
# from repo root (Node 22, npm ci already done)
npx tsx src/features/ai-worker/training/cli.ts \
  --games=200 --opponent=heuristic --label=outcome \
  --exploration=0.15 --max-moves=400 --epochs=3 \
  --eval-every=50 --eval-games=80 --nn-blend=1
```

- Loads/saves weights at `public/model_weights.json`.
- `runTournament()` standalone: `npx tsx src/features/ai-worker/training/tournament.ts` (env `N_GAMES`, `NN_BLEND`).

## 4. Measured results (pure-NN winrate vs heuristic, decisive games)

| Method | Result |
|--------|--------|
| Committed weights baseline (expectimax-imitation, ~244k examples) | 24% |
| Blend self-play (NN+heur) + replay-buffer refit | 20–27% |
| Pure NN self-play + replay-buffer refit | 5–22.5% |
| Mixed NN-vs-heuristic + replay-buffer refit | 15–22.5% |
| Mixed NN-vs-heuristic + on-policy MC outcome (BEST) | 25–45%, avg ~33%, peak 50% |
| Mixed NN-vs-heuristic + on-policy TD(0) bootstrap | 5–20% (collapsed) |
| Bigger net 198→128→1, random init, 60 games | 5% (needs far more games) |

600-game run (eval-games=80): 41 / 26 / 29 / 30 / 45 / 24 % → plateaus ~30–40%, NO upward trend.

## 5. Root causes found along the way (all fixed or measured)

1. **tfjs `fit()` is single-flight** — a non-awaited `onGameComplete` callback started a second fit while the first was ongoing → `"Cannot start training because another fit() call is ongoing"` → `trainedCount=0` forever. Fixed by awaiting the callback + a fit-queue mutex in `trainOnGame`.
2. **Expectimax-as-teacher cannot be beaten by imitation** (E3) — the committed net regresses the heuristic's own value, so as a pure policy it can't exceed the heuristic (24%). Replaced labels with real game outcome (MC).
3. **Degenerate policy cycles** — a near-flat committed NN makes deterministic greedy play loop forever (same board + side). Added a cycle-breaker (forced random move on position recurrence). Without it ~50% of pure-NN games stalled at the move cap.
4. **Replay-buffer refit overfits** — refitting the whole 3000-example buffer every game drove loss to ~0.04 (memorization) and the net stopped generalizing (tournament degraded). On-policy (fit only the current game) fixed it.
5. **TD(0) collapse** — 1-step bootstrap targets with a weak net are all ~0, so the net learns "everything is 0" (5–20%). MC outcome is strictly better here.
6. **Net capacity is the real ceiling** — 198→40→1 with ~20–40k MC examples on CPU plateaus ~30–45%. TD-Gammon needed a much larger net + millions of games.

## 6. What is still missing to reach >= 60%

- **Bigger net** trained from scratch on CPU is too slow to converge in-session (128-unit probe: 5% after 60 games).
- Recommended path (likely needs GPU / overnight):
  1. Increase net capacity — ideally match the browser model `198→512→256→128→1` (this would ALSO fix bug E2: the browser never loads trained weights because `applyLocalWeights` expects that shape).
  2. Train a long on-policy MC block: mixed opponent (NN vs heuristic), `exploration` starting ~0.15 with decay, epochs=3, thousands of games.
  3. Alternatively keep 40-unit net but train 10^4+ games on GPU.
- The current best checkpoint (a trained 40-unit net, ~33–45%) is NOT shipped: `public/model_weights.json` is restored to the committed baseline.

## 7. Known pre-existing issues (NOT in scope of this branch, flagged for later)

- `tsc -b` fails with 3 pre-existing errors in `nn-model.ts`: `node:fs`, `node:path`, `process` (no `@types/node` in `tsconfig.app.json`; these lines run under Node/tsx, not the browser build).
- Browser model architecture mismatch (E2): `public/ai/tfjs_model/tfjs_model/model.json` is `198→512(+BN+Dropout)→256→128→1`; `applyLocalWeights` always fails; browser never uses trained weights.
- `WEIGHTS_VERSION` mismatch (`cli.ts`=244664 vs `game-board/nn-model.ts`=244663) → permanent "Stale model weights detected" warning.
- `scripts/train-selfplay.ts` (`npm run train:ai`) is broken on master (imports `getBestSequence`/`setNNEvaluator` which no longer exist in `expectimax.ts`).
- Legacy scripts under `scripts/ai-training/*.ts` still use the old `SelfPlayRunner` API (`depth`, `storeTranspositions`) and will break.

## 8. Files to look at first (for the reviewing AI)

1. `src/features/ai-worker/training/move-picker.ts`
2. `src/features/ai-worker/training/self-play.ts`
3. `src/features/ai-worker/training/cli.ts`
4. `src/features/ai-worker/training/tournament.ts`
5. `src/features/ai-worker/nn-model.ts` (`trainOnGame`, `evaluateBatch`)
6. `src/entities/game/full-turn-generator.ts` (`maxSequences`)
7. `docs/BACKGAMMON_RL_DESIGN.md` (project design context)
