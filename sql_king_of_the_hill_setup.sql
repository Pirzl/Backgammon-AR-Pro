-- =============================================================================
-- BACKGAMMON VIVO - Database Setup for King of the Hill & Bounty System
-- =============================================================================
-- Run this SQL in your Supabase SQL Editor to enable:
-- 1. AI Win Streak tracking (for leaderboards and bounty)
-- 2. Leaderboard RPC function (get_king_of_the_hill)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Add streak columns to profiles table
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_ai_win_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_ai_win_streak INTEGER DEFAULT 0;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_ai_streak_current 
ON public.profiles(current_ai_win_streak DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_ai_streak_max 
ON public.profiles(max_ai_win_streak DESC);

-- Add index on wallet points for leaderboard
CREATE INDEX IF NOT EXISTS idx_wallets_saldo 
ON public.wallets(saldo_actual DESC);

-- -----------------------------------------------------------------------------
-- STEP 2: Create King of the Hill RPC function
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_king_of_the_hill();

CREATE OR REPLACE FUNCTION public.get_king_of_the_hill()
RETURNS TABLE (
  top_points JSONB,
  top_streaks JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return both arrays as separate columns
  -- Top 5 by Points (using subquery to properly order and limit)
  RETURN QUERY
  SELECT 
    (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(p.first_name || ' ' || p.last_name, 'Anonymous') as name, w.saldo_actual as points
        FROM public.wallets w
        LEFT JOIN public.profiles p ON w.user_id = p.id
        ORDER BY w.saldo_actual DESC
        LIMIT 5
      ) t
    ) AS top_points,
    (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(p.first_name || ' ' || p.last_name, 'Anonymous') as name, p.current_ai_win_streak as streak
        FROM public.profiles p
        WHERE p.current_ai_win_streak > 0
        ORDER BY p.current_ai_win_streak DESC
        LIMIT 5
      ) t
    ) AS top_streaks;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_king_of_the_hill() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_king_of_the_hill() TO anon;

-- -----------------------------------------------------------------------------
-- STEP 3: Update the process_ai_match function (if not already created)
-- This handles the 1500pt bounty when player beats AI 3 times in a row
-- -----------------------------------------------------------------------------
-- Drop ALL versions of the function first
DROP FUNCTION IF EXISTS public.process_ai_match;

CREATE OR REPLACE FUNCTION public.process_ai_match(p_amount integer, p_user_won boolean, p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_current_balance integer;
  v_actual_deduction integer;
  v_current_streak integer;
  v_max_streak integer;
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Guest user - skipping AI match processing';
    RETURN false;
  END IF;

  SELECT saldo_actual INTO v_current_balance FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  SELECT current_ai_win_streak, max_ai_win_streak INTO v_current_streak, v_max_streak FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  
  v_current_streak := COALESCE(v_current_streak, 0);
  v_max_streak := COALESCE(v_max_streak, 0);

  IF p_user_won THEN
    v_current_streak := v_current_streak + 1;
    IF v_current_streak > v_max_streak THEN v_max_streak := v_current_streak; END IF;

    UPDATE public.wallets SET saldo_actual = saldo_actual + p_amount, updated_at = now() WHERE user_id = v_user_id;
    INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
    VALUES (v_user_id, 'win', p_amount, v_current_balance, v_current_balance + p_amount, 'Won against AI');

    IF v_current_streak = 3 THEN
      UPDATE public.wallets SET saldo_actual = saldo_actual + 1500, updated_at = now() WHERE user_id = v_user_id;
      INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
      VALUES (v_user_id, 'bonus', 1500, v_current_balance + p_amount, v_current_balance + p_amount + 1500, 'Bounty: Beat Grandmaster 3 times');
      v_current_streak := 0;
    END IF;
  ELSE
    v_current_streak := 0;
    v_actual_deduction := least(v_current_balance, p_amount);
    IF v_actual_deduction > 0 THEN
      UPDATE public.wallets SET saldo_actual = saldo_actual - v_actual_deduction, updated_at = now() WHERE user_id = v_user_id;
      INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
      VALUES (v_user_id, 'loss', v_actual_deduction, v_current_balance, v_current_balance - v_actual_deduction, 'Lost against AI');
    END IF;
  END IF;

  UPDATE public.profiles SET current_ai_win_streak = v_current_streak, max_ai_win_streak = v_max_streak WHERE id = v_user_id;
  RETURN true;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.process_ai_match TO authenticated;

-- -----------------------------------------------------------------------------
-- DONE!
-- -----------------------------------------------------------------------------
-- The database is now ready for:
-- - 1500pt Bounty: Automatically awarded when player beats AI 3x in a row
-- - King of the Hill Leaderboard: Shows top 5 by points and by streak
-- 
-- Next steps:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Test the leaderboard at ClientPortal
-- 3. Play against AI to trigger bounty!
-- -----------------------------------------------------------------------------
