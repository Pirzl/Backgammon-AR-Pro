-- Fix: Allow AI Worker to store learning data
-- The AI worker runs in a Web Worker context without auth.uid()
-- Since zobrist_evaluations contains no PII (just board positions and math),
-- we can allow anonymous inserts for AI learning

-- Drop the restrictive policies
DROP POLICY IF EXISTS "Authenticated users can insert evaluations" ON public.zobrist_evaluations;
DROP POLICY IF EXISTS "Authenticated users can update evaluations" ON public.zobrist_evaluations;

-- NEW: Allow anyone to INSERT/UPDATE AI evaluations
-- Rationale: AI learning data is non-sensitive, contains only board hashes and equity values
CREATE POLICY "Public can insert evaluations for AI learning" 
ON public.zobrist_evaluations
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can update evaluations for AI learning" 
ON public.zobrist_evaluations
FOR UPDATE 
USING (true);

-- Admin-only DELETE remains unchanged (data cleanup protection)

-- Add helpful comments
COMMENT ON POLICY "Public can insert evaluations for AI learning" ON public.zobrist_evaluations 
IS 'Allows AI worker (unauthenticated) to store learning data. Data contains no PII.';

COMMENT ON POLICY "Public can update evaluations for AI learning" ON public.zobrist_evaluations 
IS 'Allows AI worker to improve existing evaluations through reinforcement learning.';
