-- Fix: Allow AI Worker to store game results
-- The AI worker runs without auth context, similar to zobrist_evaluations
-- Game logs contain: winner, colors, score - public stats for leaderboard

-- Drop restrictive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert game logs" ON public.game_logs;

-- NEW: Allow anyone to INSERT game results (for AI worker)
-- Rationale: Game logs are public statistics (no PII), used for leaderboards
CREATE POLICY "Public can insert game logs for stats" 
ON public.game_logs
FOR INSERT 
WITH CHECK (true);

-- Keep admin-only UPDATE/DELETE unchanged (data integrity protection)

COMMENT ON POLICY "Public can insert game logs for stats" ON public.game_logs 
IS 'Allows AI worker (unauthenticated) to save game results. Data is public statistics.';
