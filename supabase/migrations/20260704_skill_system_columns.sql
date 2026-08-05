-- ============================================================================
-- Migration: Skill System Support (SK-02, SK-03, SK-11, SK-15)
-- Date: 2026-07-04
-- Description:
--   Adds missing columns to existing tables and creates the ai_training_feedback
--   table so the new AnalysisAgent + ExecutionAgent skill system can query
--   Supabase for historical bias, self-evolve weights, and human profiling.
--
-- SAFE TO RUN: All statements use IF NOT EXISTS / DO $$ guards so they are
-- idempotent — re-running won't duplicate columns or tables.
-- ============================================================================

-- ============================================================================
-- 1. game_logs — add columns needed by SK-11 (self-evolve) and ai-service
-- ============================================================================

DO $$ BEGIN
    -- SK-11 needs to know which COLOR won (white/black) to compute AI win-rate.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_logs' AND column_name = 'winner_color'
    ) THEN
        ALTER TABLE public.game_logs ADD COLUMN winner_color TEXT;
        COMMENT ON COLUMN public.game_logs.winner_color IS 'SK-11: color that won (white/black). Used for self-evolve weekly meta.';
    END IF;
END $$;

DO $$ BEGIN
    -- ai-service.ts logs whether the AI won, for training feedback loop.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_logs' AND column_name = 'ai_won'
    ) THEN
        ALTER TABLE public.game_logs ADD COLUMN ai_won BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN public.game_logs.ai_won IS 'True when the AI player won this game. Used for training feedback.';
    END IF;
END $$;

-- ============================================================================
-- 2. game_history_analysis — add columns needed by SK-02 and SK-15
-- ============================================================================

DO $$ BEGIN
    -- SK-15: count of hit moves the human made (for aggression index).
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_history_analysis' AND column_name = 'is_hit_move'
    ) THEN
        ALTER TABLE public.game_history_analysis ADD COLUMN is_hit_move BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN public.game_history_analysis.is_hit_move IS 'SK-15: true if this turn included a hit (blot captured). Used for aggression profiling.';
    END IF;
END $$;

DO $$ BEGIN
    -- SK-15: count of safe points the human made (for aggression index).
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_history_analysis' AND column_name = 'made_point'
    ) THEN
        ALTER TABLE public.game_history_analysis ADD COLUMN made_point BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN public.game_history_analysis.made_point IS 'SK-15: true if this turn resulted in making a new point (2+ checkers). Used for aggression profiling.';
    END IF;
END $$;

DO $$ BEGIN
    -- SK-15 + SK-02: link analysis rows to specific player IDs for per-user profiling.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_history_analysis' AND column_name = 'white_player_id'
    ) THEN
        ALTER TABLE public.game_history_analysis ADD COLUMN white_player_id UUID;
        COMMENT ON COLUMN public.game_history_analysis.white_player_id IS 'SK-15: player ID of the white side. Enables per-rival profiling.';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_history_analysis' AND column_name = 'black_player_id'
    ) THEN
        ALTER TABLE public.game_history_analysis ADD COLUMN black_player_id UUID;
        COMMENT ON COLUMN public.game_history_analysis.black_player_id IS 'SK-15: player ID of the black side. Enables per-rival profiling.';
    END IF;
END $$;

-- Index for SK-15 profiling queries (filter by player, fast).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_game_history_white_player'
    ) THEN
        CREATE INDEX idx_game_history_white_player
            ON public.game_history_analysis (white_player_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_game_history_black_player'
    ) THEN
        CREATE INDEX idx_game_history_black_player
            ON public.game_history_analysis (black_player_id);
    END IF;
END $$;

-- ============================================================================
-- 3. ai_training_feedback — create table (used by ai-service.ts:319)
--    Stores end-of-game training results for the AI feedback loop.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_training_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID,
    winner TEXT NOT NULL,
    win_method TEXT NOT NULL,
    ai_won BOOLEAN NOT NULL DEFAULT FALSE,
    ai_color TEXT CHECK (ai_color IN ('white', 'black')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.ai_training_feedback IS
    'End-of-game training feedback. Records winner, method, and whether the AI won for long-term learning.';

-- Optimization: index for recent game lookups
CREATE INDEX IF NOT EXISTS idx_ai_feedback_game_id
    ON public.ai_training_feedback (game_id);

-- Optimization: index for AI win-rate queries (SK-11)
CREATE INDEX IF NOT EXISTS idx_ai_feedback_ai_won
    ON public.ai_training_feedback (ai_won);

-- ============================================================================
-- 4. RLS on ai_training_feedback
-- ============================================================================

ALTER TABLE public.ai_training_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ai_training_feedback' AND policyname = 'Public read ai feedback'
    ) THEN
        CREATE POLICY "Public read ai feedback"
            ON public.ai_training_feedback FOR SELECT
            USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ai_training_feedback' AND policyname = 'Public insert ai feedback'
    ) THEN
        CREATE POLICY "Public insert ai feedback"
            ON public.ai_training_feedback FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ai_training_feedback' AND policyname = 'Admin delete ai feedback'
    ) THEN
        CREATE POLICY "Admin delete ai feedback"
            ON public.ai_training_feedback FOR DELETE
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            );
    END IF;
END $$;

-- ============================================================================
-- 5. Ensure game_history_analysis has a text board_snapshot index for SK-02
--    SK-02 queries by board_snapshot (string) to find historical win-rate.
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_game_history_board_snapshot'
    ) THEN
        -- board_snapshot is JSONB; SK-02 queries by the hash string.
        -- We cast to text for the index since SK-02 passes it as a string filter.
        CREATE INDEX idx_game_history_board_snapshot
            ON public.game_history_analysis ((board_snapshot::text));
    END IF;
END $$;
