DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.game_history_analysis;

CREATE POLICY "Enable read access for all users" ON public.game_history_analysis FOR SELECT TO public USING (true);
CREATE POLICY "Enable insert access for all users" ON public.game_history_analysis FOR INSERT TO public WITH CHECK (true);
