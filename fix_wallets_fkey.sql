-- Find and remove any duplicate foreign keys on wallets that reference profiles
DO $$
DECLARE
    fk_name text;
BEGIN
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

-- Add exactly ONE foreign key
ALTER TABLE public.wallets 
  ADD CONSTRAINT wallets_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
