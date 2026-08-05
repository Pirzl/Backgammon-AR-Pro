# BACKGAMMON-VIVO

VIVO es un juego de backgammon en React/Vite/TS con MediaPipe AR, IA, WebRTC y ranking.
El proyecto prioriza ejecución local, pruebas accesibles y flujos listos para desarrollo.

## Stack

- React + Vite + TypeScript
- Supabase (auth, realtime, storage)
- MediaPipe (hand tracking / AR)
- WebRTC (video chat / signaling)
- IA local: expectimax + NN + self-play training

## Scripts útiles

```bash
npm install
npm run dev
npm run build
npm run test
```

## Runners de entrenamiento / verificación

En `scripts/ai-training` hay runners operacionales:

- `run-one-game.ts`: ejecuta una partida real de self-play con `SelfPlayRunner` y devuelve JSON con `winner`, `method`, `movesPlayed`, `gameTimeMs`, `positions`.
- `probe-expectimax.ts`: ejecuta `getBestMove()` en la posición inicial y devuelve JSON con `depth`, `move`, `value`, `ms`.
- `check-supabase.ts`: escanea rutas clave y cuenta referencias a Supabase/auth/session/ranking/wallet/betting.

Ejecución recomendada:

```bash
cd "E:\Proyecto\BACKGAMMON\BACKGAMMON-VIVO - copia"
npx.cmd tsx scripts/ai-training/run-one-game.ts
npx.cmd tsx scripts/ai-training/probe-expectimax.ts
npx.cmd tsx scripts/ai-training/check-supabase.ts
```

## Notas

- Si `tsx` no está disponible, usar `npx.cmd tsx ...` en Windows.
- Los runners de entrenamiento no modifican la UI ni el gameplay; son de lectura/ejecución controlada.
