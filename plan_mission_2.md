# Mission 2 Plan: King of the Hill & Tournaments

## Goal 1: Top 5 Leaderboard (King of the Hill)
We need to display the top 5 players by Points and by AI Win Streak on the User Dashboard.

**Database Support (SQL needed):**
- Query for Top Points is easy: `SELECT user_id, saldo_actual FROM wallets ORDER BY saldo_actual DESC LIMIT 5`
- Query for Top Win Streaks is harder. We should add a `current_ai_win_streak` and `max_ai_win_streak` column to the `profiles` or a new `player_stats` table. Since `profiles` exists, we can add it there via SQL.
- We need a trigger or an update to the game over logic to increment this streak when winning against AI, and reset to 0 when losing.

**Frontend Support (React):**
- Add a new UI component `Leaderboard.tsx` in the Client Portal.
- Fetch the data and display it prominently.

## Goal 2: Tournaments 20% House Fee
**Frontend Support (React):**
- In `TournamentManager.tsx` (Admin), when creating a tournament, if the buy-in is X, the prize pool should default to X * MaxPlayers * 0.8.
- In the actual tournament logic (when it completes), the house fee should be diverted somewhere. Currently, tournament creation is mostly UI state. We need to update the `prizePool` calculation logic.

I will start by preparing the SQL for the AI Win Streaks.
