-- Execute this in your Supabase SQL Editor to allow anonymous users (like your test) to save game history

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.game_history_analysis;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.game_history_analysis;

-- Create new policies allowing anon users to read and insert (since AI games don't require login yet)
CREATE POLICY "Enable read access for all users" 
    ON public.game_history_analysis FOR SELECT 
    TO public 
    USING (true);

CREATE POLICY "Enable insert access for all users" 
    ON public.game_history_analysis FOR INSERT 
    TO public 
    WITH CHECK (true);
