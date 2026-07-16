# Final Plan: AI Economy & Admin Dashboard

## 1. Context & Approvals
- Database has been successfully updated with `process_ai_match` (handles wins AND losses against AI).
- Database has been successfully updated with `get_admin_economy_stats` (RPC for retrieving global point metrics).
- All existing wallets have been reset to 500 via SQL.
- We are ready to proceed with the React frontend modifications once execution mode is granted.

## 2. File Edits Required

### A. Frontend Defaults Fix (`src/features/game-board/lib/useWallet.ts`)
- Replace the 5 occurrences of `5000` with `500` to fix the visual fallback issue immediately upon app load.

### B. Admin Fallbacks Fix (Various Files)
- In `ClientDetails.tsx`, `ClientList.tsx`, and `useClients.ts`, change hardcoded `?? 5000` fallbacks to `?? 500`.

### C. Game Logic Integration (`src/features/game-board/ui/GameBoard.tsx`)
- Inside the game over logic block, hook up the AI processing function.
- If `isVsComputer` is true:
  - If `state.winner === 'white'` (Human wins): Call `supabase.rpc('process_ai_match', { p_amount: totalGanado, p_user_won: true })`.
  - If `state.winner === 'black'` (Human loses): Call `supabase.rpc('process_ai_match', { p_amount: totalGanado, p_user_won: false })`.

### D. Admin Dashboard Data Hook (`src/features/admin/hooks/useAdminStats.ts`)
- Create a new hook (or expand `useAdminStats`) to fetch `get_admin_economy_stats()`.
- Add state variables: `totalCirculatingPoints`, `totalGivenByAI`, `totalTakenByAI`.

### E. Admin Dashboard UI (`src/features/admin/components/AdminDashboard.tsx`)
- Import the new variables from the hook.
- The current layout has 4 `<StatCard>` components in a grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
- I will modify the grid to `lg:grid-cols-4` or `lg:grid-cols-3` depending on space, and insert 3 new StatCards specifically for the Economy:
  1. **Global Points in Circulation** (Icon: Database / DollarSign)
  2. **Points Minted by AI** (Icon: ArrowUp / TrendingUp)
  3. **Points Reclaimed by AI** (Icon: ArrowDown / TrendingDown)
