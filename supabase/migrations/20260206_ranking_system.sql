-- 20260206_ranking_system.sql
-- Add ranking and streak tracking columns to profiles table

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS rank_current text DEFAULT 'Principiante',
ADD COLUMN IF NOT EXISTS rank_highest text DEFAULT 'Principiante',
ADD COLUMN IF NOT EXISTS current_streak int DEFAULT 0, -- Positive for win streak, negative for loss streak
ADD COLUMN IF NOT EXISTS matches_played_30 jsonb DEFAULT '[]'::jsonb, -- Store recent match results for quick calculation
ADD COLUMN IF NOT EXISTS ranking_metadata jsonb DEFAULT '{}'::jsonb; -- Extra metadata (e.g. last update timestamp)

-- Create an index on rank for leaderboards if needed later
CREATE INDEX IF NOT EXISTS idx_profiles_rank_current ON profiles(rank_current);
