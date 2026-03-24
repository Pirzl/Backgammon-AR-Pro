-- FINAL AUTHORITATIVE FIX: Storage Monitoring Function
-- Supersedes: fix_storage_monitoring.sql, fix_storage_monitoring_final.sql, fix_storage_monitoring_v2.sql
-- Date: 2026-02-05
-- Issue: pg_stat_user_tables uses 'relname', NOT 'tablename'

-- Drop and recreate to ensure clean state
DROP FUNCTION IF EXISTS get_table_sizes();

CREATE FUNCTION get_table_sizes()
RETURNS TABLE (
  table_name TEXT,
  size_kb BIGINT,
  row_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Security: Only admins can call this function
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role::text = 'admin'
  ) INTO is_admin_user;
  
  IF NOT is_admin_user THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Return table sizes and row counts
  -- CRITICAL: pg_stat_user_tables uses 'relname', not 'tablename'
  RETURN QUERY
  SELECT 
    (t.schemaname || '.' || t.relname)::TEXT,
    (pg_total_relation_size(t.schemaname || '.' || t.relname) / 1024)::BIGINT,
    COALESCE(t.n_live_tup, 0)::BIGINT
  FROM pg_stat_user_tables t
  WHERE t.schemaname = 'public'
  ORDER BY pg_total_relation_size(t.schemaname || '.' || t.relname) DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_table_sizes() TO authenticated;

COMMENT ON FUNCTION get_table_sizes() IS 
'Returns storage usage by table. Admin only. Uses SECURITY DEFINER. v3: Fixes relname column reference.';
