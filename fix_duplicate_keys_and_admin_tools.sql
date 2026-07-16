-- ============================================================================
-- 1. FIX DUPLICATE FOREIGN KEYS ON WALLETS (PGRST201 Error Fix)
-- ============================================================================
DO $$
DECLARE
    fk_name text;
BEGIN
    -- Find and drop ALL foreign keys on the wallets table
    FOR fk_name IN 
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_name = 'wallets'
    LOOP
        EXECUTE 'ALTER TABLE public.wallets DROP CONSTRAINT ' || fk_name;
    END LOOP;
END $$;

-- Add exactly ONE foreign key with ON DELETE CASCADE
ALTER TABLE public.wallets 
  ADD CONSTRAINT wallets_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. ADMIN: TOGGLE USER STATUS (Block/Unblock)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(p_admin_id uuid, p_target_user_id uuid, p_new_status text)
RETURNS boolean AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- Verify admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_admin_id AND lower(role) = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only admins can modify user status';
    END IF;
    
    -- Update profile status
    UPDATE public.profiles
    SET status = p_new_status, updated_at = now()
    WHERE id = p_target_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. ADMIN: DELETE USER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_admin_id uuid, p_target_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- Verify admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_admin_id AND lower(role) = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only admins can delete users';
    END IF;
    
    -- Delete from auth.users (cascades to profiles, wallets, etc)
    DELETE FROM auth.users WHERE id = p_target_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
