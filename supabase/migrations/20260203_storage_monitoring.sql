-- Migration: Storage Monitoring & Activity Tracking
-- Description: Add columns for player activity tracking and function for storage monitoring
-- Created: 2026-02-03

-- ============================================================================
-- 1. Add activity tracking columns to profiles
-- ============================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline',
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now();

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen 
ON public.profiles(last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_status 
ON public.profiles(status) 
WHERE status = 'online';

-- ============================================================================
-- 2. Function to update last_seen automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update last_seen on profile updates
DROP TRIGGER IF EXISTS trigger_update_last_seen ON public.profiles;
CREATE TRIGGER trigger_update_last_seen
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen();

-- ============================================================================
-- 3. Storage monitoring function (Admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_sizes()
RETURNS TABLE (
  table_name TEXT,
  size_kb BIGINT,
  row_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security: Only admins can call this function
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Return table sizes and row counts
  RETURN QUERY
  SELECT 
    (schemaname || '.' || tablename)::TEXT AS table_name,
    (pg_total_relation_size(schemaname || '.' || tablename) / 1024)::BIGINT AS size_kb,
    COALESCE(n_live_tup, 0)::BIGINT AS row_count
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY size_kb DESC;
END;
$$;

-- Grant execute permission to authenticated users
-- (The function itself enforces admin-only access)
GRANT EXECUTE ON FUNCTION get_table_sizes() TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_table_sizes() 
IS 'Returns storage usage by table. Admin access only. Used for storage monitoring dashboard.';

-- ============================================================================
-- 4. Active users view for quick stats
-- ============================================================================

CREATE OR REPLACE VIEW active_users_view AS
SELECT 
  COUNT(*) FILTER (WHERE status = 'online') AS online_count,
  COUNT(*) FILTER (WHERE last_seen > now() - interval '5 minutes') AS active_5min,
  COUNT(*) FILTER (WHERE last_seen > now() - interval '1 hour') AS active_1hour,
  COUNT(*) AS total_users
FROM public.profiles;

-- Grant access to authenticated users
GRANT SELECT ON active_users_view TO authenticated;

-- ============================================================================
-- 5. Update existing admin_stats_view to use new columns
-- ============================================================================

-- Drop existing view to allow column name changes
DROP VIEW IF EXISTS public.admin_stats_view;

-- Recreate with updated column structure
CREATE VIEW public.admin_stats_view AS
SELECT
  (SELECT online_count FROM active_users_view) AS active_users_count,
  (SELECT COUNT(*) FROM public.profiles) AS total_users,
  (SELECT COALESCE(SUM(buy_in * current_players), 0) FROM public.tournaments) AS total_entry_fees_collected,
  (SELECT COALESCE(SUM(prize_won), 0) FROM public.tournament_participants) AS total_prizes_distributed,
  (SELECT COUNT(*) FROM public.tournaments WHERE status = 'Completed') AS tournaments_completed;
