-- Migration: extend_profiles_stats (Retry 3)
-- Purpose: Add missing stats columns to profiles and create stats view
-- Created: 2026-01-31

-- 1. Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tournaments_played INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tournaments_won INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_entry_fees NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_prizes NUMERIC DEFAULT 0;

-- 2. Drop view if exists
DROP VIEW IF EXISTS profile_stats;

-- 3. Create view for easy stats access
CREATE OR REPLACE VIEW profile_stats AS
SELECT 
  id,
  username,
  tournaments_played,
  tournaments_won,
  total_entry_fees,
  total_prizes,
  (COALESCE(total_prizes, 0) - COALESCE(total_entry_fees, 0)) AS net_results
FROM profiles;

GRANT SELECT ON profile_stats TO authenticated;
