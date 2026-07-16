# Continuing Mission 2 & Starting Mission 3

## 1. Finish King of the Hill Leaderboard
- Create `src/features/client/components/KingOfTheHill.tsx` component to display the top 5 points and top 5 streaks side-by-side.
- Add it to the top of `UserDashboard.tsx` or `ClientPortal.tsx` so users see it immediately.

## 2. Update Streak Logic in `process_ai_match` SQL (Mission 3 Setup)
- I need to update the `process_ai_match` function so that when `p_user_won` is true, it increments `current_ai_win_streak`. If the streak hits 3, it awards the 1500 pt bounty!
- If `p_user_won` is false, it resets `current_ai_win_streak` to 0.
- It also needs to update `max_ai_win_streak`.

## 3. Mission 3: The Sassy Chat AI
- Connect Gemini to `GameBoard.tsx` to generate taunts based on game events (e.g. doubles, captures).
