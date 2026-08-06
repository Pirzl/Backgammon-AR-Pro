-- H2H stats increment for VIVO Supabase
-- Run after supabase_profiles_setup.sql

CREATE OR REPLACE FUNCTION public.increment_h2h_stats(
  p_winner uuid,
  p_loser uuid,
  p_payout integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment played count for both
  UPDATE public.profiles
  SET tournaments_played = COALESCE(tournaments_played, 0) + 1
  WHERE id IN (p_winner, p_loser);

  -- Winner stats
  UPDATE public.profiles
  SET 
    tournaments_won = COALESCE(tournaments_won, 0) + 1,
    total_prizes = COALESCE(total_prizes, 0) + p_payout,
    skill_rating = COALESCE(skill_rating, 1200) + CASE WHEN p_payout > 0 THEN 25 ELSE 0 END
  WHERE id = p_winner;

  -- Loser stats
  UPDATE public.profiles
  SET 
    skill_rating = GREATEST(COALESCE(skill_rating, 1200) - 15, 800)
  WHERE id = p_loser;
END;
$$;
