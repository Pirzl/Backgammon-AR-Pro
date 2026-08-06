-- -----------------------------------------------------------------------------
-- FIX get_king_of_the_hill (2026-08-06)
-- La versión desplegada (de 20260222_final_points_fix.sql) usaba
--   SELECT json_agg(json_build_object(...)) ... ORDER BY w.saldo_actual
-- sin GROUP BY -> error 42803: column "w.saldo_actual" must appear in the
-- GROUP BY clause. Además devolvía un único json (la app espera una TABLE
-- con filas top_points / top_streaks: `result[0].top_points`).
-- Este fix usa subconsultas ordenadas (formato de sql_king_of_the_hill_setup.sql)
-- y la firma TABLE que consume OctagonMenu.tsx y KingOfTheHill.tsx.
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
  RETURN QUERY
  SELECT
    (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(p.username, 'Anonymous') AS name, w.saldo_actual AS points
        FROM public.wallets w
        LEFT JOIN public.profiles p ON w.user_id = p.id
        ORDER BY w.saldo_actual DESC
        LIMIT 10
      ) t
    ) AS top_points,
    (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(p.username, 'Anonymous') AS name, p.current_ai_win_streak AS streak
        FROM public.profiles p
        WHERE p.current_ai_win_streak > 0
        ORDER BY p.current_ai_win_streak DESC
        LIMIT 5
      ) t
    ) AS top_streaks;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_king_of_the_hill() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_king_of_the_hill() TO anon;
