# AGENTS.md — VIVO Backgammon

Memoria persistente para agentes de IA que trabajan en este repo.

- **Qué es**: VIVO, backgammon en React/Vite/TS + Supabase + MediaPipe (hand tracking) + WebRTC. IA local: expectimax + NN + self-play.
- **Memoria detallada del proyecto (IA, verificación, trampas, estado)**: leer **`MEMORY.md`**.
- **Nota Obsidian detallada (histórico de cambios)**: `C:\Users\tompi\Documents\Obsidian Vault\01-VIVO\2026-08-01 VIVO Backgammon AI - Fix L9-10.md`.
- **Windows**: `npx.ps1` bloqueado por ExecutionPolicy. Usar `.\node_modules\.bin\tsc.cmd`, `.\node_modules\.bin\vitest.cmd`, `node_modules\tsx\dist\cli.mjs`, o `npx.cmd`.
- **No usar** `node` directo para scripts TS (imports extensionless fallan); usar `tsx`.
- **Verificación**: `tsc -b` + `vitest run` (71 tests) + `npm run build`. Detalles en `MEMORY.md`.
