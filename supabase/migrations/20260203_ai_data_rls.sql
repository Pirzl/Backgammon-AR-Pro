-- Migration: AI Data Row-Level Security
-- Description: Add RLS policies to protect AI learning data (zobrist_evaluations, game_logs)
-- Created: 2026-02-03

-- ============================================================================
-- 1. Enable RLS on AI tables
-- ============================================================================

ALTER TABLE public.zobrist_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. zobrist_evaluations policies
-- ============================================================================

-- Policy: Everyone can READ evaluations (for Wisdom Widget and AI lookups)
-- Rationale: This data contains no PII, only board positions and mathematical evaluations
CREATE POLICY "Public read access for zobrist evaluations" 
ON public.zobrist_evaluations
FOR SELECT 
USING (true);

-- Policy: Allow INSERT for authenticated users (AI worker during games)
-- The AI worker runs in the browser context with the user's auth token
CREATE POLICY "Authenticated users can insert evaluations" 
ON public.zobrist_evaluations
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Allow UPDATE for authenticated users (improving evaluations)
CREATE POLICY "Authenticated users can update evaluations" 
ON public.zobrist_evaluations
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Policy: Only admins can DELETE evaluations
CREATE POLICY "Admin only delete evaluations" 
ON public.zobrist_evaluations
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================================
-- 3. game_logs policies
-- ============================================================================

-- Policy: Everyone can READ game logs (for statistics and learning)
CREATE POLICY "Public read access for game logs" 
ON public.game_logs
FOR SELECT 
USING (true);

-- Policy: Authenticated users can INSERT their own game logs
CREATE POLICY "Authenticated users can insert game logs" 
ON public.game_logs
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only admins can UPDATE/DELETE game logs (data integrity)
CREATE POLICY "Admin only modify game logs" 
ON public.game_logs
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin only delete game logs" 
ON public.game_logs
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================================
-- 4. Security audit logging (optional - for admin actions)
-- ============================================================================

COMMENT ON POLICY "Public read access for zobrist evaluations" ON public.zobrist_evaluations 
IS 'Allows all users to read AI evaluations for Wisdom Widget and game AI';

COMMENT ON POLICY "Admin only delete evaluations" ON public.zobrist_evaluations 
IS 'Only admins can delete evaluations for data cleanup';

COMMENT ON POLICY "Public read access for game logs" ON public.game_logs 
IS 'Allows all users to read game history for statistics';

COMMENT ON POLICY "Admin only modify game logs" ON public.game_logs 
IS 'Only admins can modify game logs to prevent data tampering';
