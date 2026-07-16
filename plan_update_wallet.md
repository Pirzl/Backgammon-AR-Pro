# Plan: Sync Wallet Balance to 500

## Objective
Update the frontend and game logic to ensure new and existing users start with 500 points, and enable earning points by winning against the AI.

## Step 1: Update Frontend Wallet Hook
File: `src/features/game-board/lib/useWallet.ts`
Change all occurrences of `5000` to `500` so the initial loading state and the "new wallet" creation fallback align with the new database defaults.

## Step 2: Update Admin Dashboard Fallbacks
Files: 
- `src/features/admin/components/ClientDetails.tsx`
- `src/features/admin/components/ClientList.tsx`
- `src/features/admin/hooks/useClients.ts`
Change the fallback logic `?? 5000` to `?? 500` to ensure the Admin view correctly reflects the new system default.

## Step 3: Enable Earning Points from AI
File: `src/features/game-board/ui/GameBoard.tsx`
Location: Inside the `useEffect` that handles game-over logic (around line 852).
Action: Add an `else if (isVsComputer && state.winner === 'white')` block.
Logic:
1. Detect a human win against the AI.
2. Call `supabase.rpc('claim_ai_win', { p_amount: totalGanado })`
3. Since `totalGanado` uses `stakeInicial` (100) * cube multiplier, users will earn proportional points for beating the Grandmaster.

## Note on Database
The database has already been successfully updated with the new 500 constraints, the `claim_ai_win` function, and existing balances have been reset to 500 via SQL.
