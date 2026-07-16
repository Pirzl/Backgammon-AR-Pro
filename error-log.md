# Error Log & Lessons Learned

## 2026-01-24: Unused Imports in Production Build

**Context:** During the critical refactor of `Board Constants` (`BAR` -> `BAR_WHITE`, etc.), we updated `expectimax.ts` to use helper functions but left the constant imports (`BAR_WHITE`, `BAR_BLACK`, etc.) unused in the file header.
**Error:** `tsc` (TypeScript Compiler) failed the build because `noUnusedLocals` or strict checks flagged these imports.
**Resolution:** Removed unused imports.
**Lesson:** Always run a linter or check for unused variables after refactoring imports, especially when moving from direct constant usage to helper function usage. Clean up as you go.

## 2026-01-24: Logic Collision in Board Representation

**Context:** Initial audit revealed that `BAR` was 0 and `OFF` was 25 for BOTH players.
**Error:** This caused potential checker collision (White hit -> Bar 0. Black Bar -> 0).
**Resolution:** Refactored board to use indices 26, 27, 28, 29 for specific player zones.
**Lesson:** In shared-state arrays, never reuse indices for opposing player conceptual zones unless logic explicitly handles the sign/ownership separation perfectly (and even then, unique indices are safer for debugging).

### [2026-01-31] `StatCard.tsx`: React Invalid Element Type

**Context:** During Phase 3, Step 2 (Admin Integration) verification, specifically when integrating `StatCard` components.
**Description:** The `StatCard` component was designed to accept a `LucideIcon` _component type_ as its `icon` prop. However, when passing an _instantiated_ icon (e.g., `<Activity />` instead of `Activity`), React threw an "Element type is invalid" error.
**Error:** `Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object.`
**Resolution:** Updated the `StatCard` component's `icon` prop type to accept `ReactNode` to correctly handle both component types and instantiated elements.
**Status:** FIXED.

### [2026-01-31] AdminDashboard TS Lint Errors

**Context:** Phase 3, Step 2 (Admin Integration) verification.
**Resolution:** Removed unused imports (`Activity`, `List`, `supabase`) and unused `setClients` setter.
**Status:** FIXED.

### [2026-01-31] Invalid Import Path in `useClients.ts`

**Context:** Phase 3, Step 2.5 (Admin Layout Restoration)
**Error:** `[plugin:vite:import-analysis] Failed to resolve import "../../../lib/supabase" from "src/features/admin/hooks/useClients.ts".`
**Root Cause:** Blindly copied code assumed the Supabase client was in `lib/supabase`, but in this project structure it resides in `shared/api/supabase.ts`.
**Resolution:** Updated import path to correct location.
**Status:** FIXED.

### [2026-02-13] MediaPipe Worker `self.import` Error

**Context:** Implementing Hand Tracking with `@mediapipe/tasks-vision` in a Vite project.
**Error:** `TypeError: self.import is not a function` (in Worker).
**Description:** The `@mediapipe/tasks-vision` package (specifically `vision_bundle.js`) uses a polyfill that attempts to call `self.import()` to load WASM modules. However, in an ESM Worker context or when bundled by Vite, this fails because `import()` is not available on `self` in the way the polyfill expects.
**Attempted Fixes:**

1.  **Vite Worker Import:** Tried to use `import()` with `/* @vite-ignore */` -> Failed with "Failed to load URL".
2.  **ESM Worker:** Switched to `{ type: 'module' }` -> Failed because the internal MediaPipe loader still tried to use `self.import` or `importScripts` incorrectly for the WASM.
    **Resolution:** **"Classic Worker + Local Assets + Shim"**
3.  **Assets:** Downloaded `vision_bundle.js` and `vision_wasm_internal.wasm` manually to `public/mediapipe/`.
4.  **Worker Type:** Reverted `MediaPipeProvider` to use `new Worker(..., { type: 'classic' })`.
5.  **Shim:** In `hand-detection.worker.ts`, we used `importScripts('/mediapipe/vision_bundle.js')` but had to SHIM the `exports` object because the bundle is CommonJS/UMD.
    ```typescript
    const exports: any = {};
    importScripts("/mediapipe/vision_bundle.js");
    const { FilesetResolver, HandLandmarker } = exports;
    ```
6.  **Syntax:** Removed all top-level `import/export` statements from the worker file to ensure it is treated as a Script, not a Module.

### [2026-02-14] WebRTC Signaling Race Condition (InvalidStateError)

**Context:** Establishing P2P connection for Crystal Window.
**Error:** `InvalidStateError: Failed to execute 'addIceCandidate' on 'RTCPeerConnection': The remote description has not yet been set.`
**Root Cause:** ICE candidates were arriving before the `setRemoteDescription` call completed due to network latency variances.
**Resolution:** Implemented an `iceCandidateQueue` in `useVideoChat.ts`. Candidates arriving early are queued and flushed immediately after `setRemoteDescription` succeeds.
**Status:** FIXED.

### [2026-02-14] Game Sync "Silent Failure" (Payload Unwrapping)

**Context:** Game state synchronization over Supabase Realtime fallback.
**Error:** `GameBoard` received messages but did not dispatch `GAME_UPDATE` events. Logs showed message arrival but no action.
**Root Cause:** `SupabaseSignaling.ts` unwrapped the `payload` from the broadcast message, but `GameBoard.tsx` expected the message _wrapper_ to contain a `payload` property. effectively looking for `msg.payload.payload`.
**Resolution:** Updated `GameBoard.tsx` to inspect the unwrapped message directly (`msg.type === 'GAME_UPDATE'`) instead of `msg.payload.type`.
**Status:** FIXED.

### [2026-02-14] Dice RNG Synchronization (Split-Brain)

**Context:** Multiplayer dice rolling.
**Error:** Each player saw different dice numbers for the same turn.
**Root Cause:** The `ROLL_DICE` action triggered `Math.random()` inside the local reducer for _each_ client independently.
**Resolution:** Moved RNG to the event handler (`handleRollDice`). The active player generates the numbers and broadcasts them as part of the `ROLL_DICE` payload. The reducer now accepts an optional `dice` array.
**Status:** FIXED.

### [2026-02-14] Match Query Error (Column Missing)

**Context:** Fetching player colors in `GameBoard.tsx`.
**Error:** `column matches.white_player_id does not exist` (400 Bad Request).
**Root Cause:** The `matches` table was either missing or schema mismatched.
**Resolution:** Switched to querying the `invitations` table, which reliably contains `sender_id` (White/Host) and `receiver_id` (Black/Guest) linked by `room_id`.
**Status:** FIXED.

### [2026-02-15] Production Build: `exports is not defined` + CSP Violation

**Context:** Deploying to Hostinger production.
**Errors:**

1. `Uncaught ReferenceError: exports is not defined` in `vision_bundle.js` (loaded by hand-detection worker)
2. `Loading the image 'felt.png' violates CSP directive: img-src 'self' data: blob: https://*.supabase.co`

**Root Cause (Error 1):** `vite.config.ts` had `'vendor-vision': ['@mediapipe/tasks-vision']` in `manualChunks`. This made Rollup analyze the package. When Vite wraps the worker in an IIFE (`format: 'iife'`), the local `const exports = {}` shim was minified to `const p = {}`. Since `vision_bundle.js` expects a **global** `exports` object (`Object.defineProperty(exports,...)`), the renamed local variable was invisible.
**Resolution (Error 1):** (a) Removed `vendor-vision` from `manualChunks`. (b) Changed `const exports: any = {}` to `(self as any).exports = {}` so the shim is a global property that survives IIFE wrapping and Rollup minification.
**Root Cause (Error 2):** `Board.tsx` loaded `felt.png` from `transparenttextures.com`, which is not in the server's CSP `img-src` allowlist.
**Resolution (Error 2):** Replaced external URL with inline SVG `data:` URI (allowed by CSP `img-src ... data:`).
**Lesson:** When using classic workers with `importScripts`, any shim objects (`exports`, `module`, etc.) **must** be assigned to `self` (global scope), not declared with `const`/`let`. Vite's IIFE wrapper + Rollup minification will rename local variables. Also: never rely on external CDNs for assets when the server has a strict CSP — use `data:` URIs or local files.
**Status:** FIXED.

### [2026-02-23] Room ID Type Mismatch (UUID vs Text)

**Context:** Opponent abandonment logic in `GameBoard.tsx` triggered a 400 Bad Request error.
**Error:** `room_id` in `invitations` table is `TEXT` (e.g., `match_123...`), while in `matches` table it is `UUID`. Querying `matches` with a non-UUID string caused a Supabase error.
**Resolution:** Implemented regex-based UUID validation before querying the `matches` table in `handleAbandon`.
**Lesson:** Never assume string-based IDs are UUIDs when cross-referencing tables with mixed schemas. Always validate format before performing typed lookups.
**Status:** FIXED.

### [2026-02-23] React 19 State Cascading (LINT)

**Context:** `useEffect` in `AdminAwardPoints.tsx` and `InvitationInbox.tsx` performed synchronous `setState` calls.
**Error:** `react-hooks/set-state-in-effect` rule flagged these as performance risks in React 19.
**Resolution:** Applied "State adjustment during render" for initial resets and `setTimeout` for async fetches to ensure non-cascading updates.
**Lesson:** Coordinate state resets with the render cycle for better performance and compliance with modern React standards.
**Status:** FIXED.

### [2026-02-23] Production Blank Screen: React Error #301 (Infinite Loop)

**Context:** After deployment, the application showed a blank screen with "Too many re-renders" in the console.
**Error:** `undefined !== null` mismatch in render-time state adjustments.
**Root Cause:** In `InvitationInbox.tsx` (which is in `App.tsx` and thus global), `user?.id` was `undefined` when logged out, but `prevUserId` was initialized to `null`. This triggered an infinite loop of `setPrevUserId(null)` which React 19 correctly flagged.
**Resolution:** Standardized all render-time state adjustments to use `id ?? null` consistently for both comparison and initialization.
**Lesson:** When using the "Adjusting state during render" pattern, ensure the comparison values are strictly normalized (e.g., both `null` or both empty strings) to prevent infinite loops during initial mount or unauthenticated states.
**Status:** FIXED.

### [2026-02-23] TypeError on Exit: p.startsWith is not a function

**Context:** Clicking the 'SALIR' button in the sidebar menu during training mode caused a crash.
**Error:** `Uncaught TypeError: p.startsWith is not a function`.
**Root Cause:** `onExit={handleExitGame}` passed the `MouseEvent` directly to `handleExitGame`, which then tried to call `.startsWith()` on it.
**Resolution:** Added `typeof targetPath === 'string'` check in `handleExitGame` and wrapped all `onExit` calls in anonymous functions to ensure a string path is passed.
**Status:** FIXED.

### [2026-03-07] H2H Unplayable: `isVsComputer` Hardcoded to `true`

**Context:** Human vs Human (H2H) multiplayer games were broken — the AI would automatically take control of the opponent's turn.
**Error:** When starting a H2H game (`?mode=human`), the AI auto-rolled dice, auto-made moves, and auto-responded to doubling offers for the remote player.
**Root Cause:** `isVsComputer` in `GameBoard.tsx` (line 88) was hardcoded as `const [isVsComputer] = useState(true)` — always `true` regardless of game mode. This caused 5 AI-specific `useEffect` hooks (move trigger, auto-dice-roll, auto-double response) to fire in H2H.
**Resolution:** Changed to `const isVsComputer = initialMode === 'ai'`, correctly deriving the flag from the actual game mode prop.
**Lesson:** Never hardcode mode flags that are intended to be dynamic. Derive them from props/context to ensure they reflect the actual runtime state.
**Status:** FIXED.
