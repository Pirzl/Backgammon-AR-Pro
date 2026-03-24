-- Debug script: Test storage monitoring access
-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check your current user and role
SELECT 
  auth.uid() as current_user_id,
  p.role,
  p.username
FROM public.profiles p
WHERE p.id = auth.uid();

-- 2. Test the admin check condition
SELECT 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) as is_admin;

-- 3. Try calling the function directly
SELECT * FROM get_table_sizes();

-- 4. Check role type
SELECT 
  column_name, 
  data_type, 
  udt_name
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'role';
