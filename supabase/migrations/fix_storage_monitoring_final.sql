-- FINAL FIX: Corrected storage monitoring function
-- This fixes the column name reference issue

CREATE OR REPLACE FUNCTION get_table_sizes()
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
  RETURN QUERY
  SELECT 
    (t.schemaname || '.' || t.tablename)::TEXT,
    (pg_total_relation_size(t.schemaname || '.' || t.tablename) / 1024)::BIGINT,
    COALESCE(t.n_live_tup, 0)::BIGINT
  FROM pg_stat_user_tables t
  WHERE t.schemaname = 'public'
  ORDER BY pg_total_relation_size(t.schemaname || '.' || t.tablename) DESC;
END;
$$;

-- Ensure permissions are set
GRANT EXECUTE ON FUNCTION get_table_sizes() TO authenticated;
