-- Fix: Allow AI data collection and offline training to work without auth
-- (A) game_history_analysis: the game inserts board snapshots per turn from the
--     browser (CONFIRM_TURN_END). Games are played without a session (anon), so
--     the authenticated-only INSERT policy blocked collection with 42501.
--     SELECT must also be public so the offline Node training pipeline can read
--     the recorded games to build TrainingExamples.
-- Rationale (mirrors fix_ai_learning_rls.sql / fix_game_logs_rls.sql):
--     game_history_analysis contains no PII (board positions + AI evaluations).
-- (B) model_weights: the offline training pipeline (Node) and the browser both
--     write the global NN checkpoint (id='current'). The authenticated-only
--     INSERT/UPDATE policies block anon writes, so training results can never
--     be persisted. Open INSERT/UPDATE to public for the shared model.
--     model_weights is a single global AI model with no per-user data.

-- ── game_history_analysis: ensure equity_score column exists ────────────────
ALTER TABLE public.game_history_analysis
  ADD COLUMN IF NOT EXISTS equity_score DOUBLE PRECISION;

-- ── game_history_analysis: drop restrictive policies ─────────────────────────
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Public can read game history for AI learning" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Public can insert game history for AI learning" ON public.game_history_analysis;

-- NEW: anyone can read game history (no PII)
CREATE POLICY "Public can read game history for AI learning"
  ON public.game_history_analysis
  FOR SELECT
  USING (true);

-- NEW: anyone can insert game history (data collection without auth)
CREATE POLICY "Public can insert game history for AI learning"
  ON public.game_history_analysis
  FOR INSERT
  WITH CHECK (true);

COMMENT ON POLICY "Public can read game history for AI learning" ON public.game_history_analysis
  IS 'Allows the offline training pipeline (unauthenticated Node) to read recorded games. Data contains no PII.';
COMMENT ON POLICY "Public can insert game history for AI learning" ON public.game_history_analysis
  IS 'Allows the game (unauthenticated) to record board snapshots per turn for AI learning.';

-- ── model_weights: keep shared-checkpoint write access for offline training ────

-- Drop restrictive write policies from the original setup
DROP POLICY IF EXISTS "Authenticated users can update model weights" ON model_weights;
DROP POLICY IF EXISTS "Authenticated users can upsert model weights" ON model_weights;
DROP POLICY IF EXISTS "Public can upsert model weights for AI training" ON model_weights;

-- Allow public insert/update for the shared NN checkpoint
CREATE POLICY "Public can upsert model weights for AI training"
  ON model_weights
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update model weights for AI training"
  ON model_weights
  FOR UPDATE
  USING (true);

COMMENT ON POLICY "Public can upsert model weights for AI training" ON model_weights
  IS 'Allows the offline training pipeline (unauthenticated Node) to persist the global NN checkpoint.';
COMMENT ON POLICY "Public can update model weights for AI training" ON model_weights
  IS 'Allows the offline training pipeline to overwrite the global NN checkpoint with newer training.';

-- ── model_weights: add idempotency guard for shared 'current' row ─────────────
CREATE OR REPLACE FUNCTION public.upsert_model_weights(p_weights jsonb, p_trained_count integer, p_total_updates integer, p_games_played integer)
RETURNS void AS $$
BEGIN
  INSERT INTO model_weights (id, weights, trained_count, total_updates, games_played, updated_at)
  VALUES ('current', p_weights, COALESCE(p_trained_count, 0), COALESCE(p_total_updates, 0), COALESCE(p_games_played, 0), now())
  ON CONFLICT (id) DO UPDATE
  SET weights = EXCLUDED.weights,
      trained_count = model_weights.trained_count + EXCLUDED.trained_count,
      total_updates = model_weights.total_updates + EXCLUDED.total_updates,
      games_played = model_weights.games_played + EXCLUDED.games_played,
      updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
