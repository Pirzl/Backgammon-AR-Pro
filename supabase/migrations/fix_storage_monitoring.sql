-- Fix: Update storage monitoring function to properly check admin role
-- This fixes the ENUM type comparison issue

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
  -- Cast role to text for comparison
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role::text = 'admin'
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
