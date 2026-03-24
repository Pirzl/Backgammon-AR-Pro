-- Migration: Sync Profiles Backfill
-- Description: Ensures public.profiles has email/username and backfills data from auth.users

-- 1. Ensure columns exist in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- 2. Update the Trigger Function to automatically sync email and username on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, first_name, last_name, role, status, last_seen)
  VALUES (
    new.id,
    new.email,
    -- Use metadata username if available, else derive from email (e.g. john@...)
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    'user', -- Default role
    'online', -- Initial status
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill Data: Update existing profiles with data from auth.users
-- This is crucial for fixing "Unknown" users currently in the system
UPDATE public.profiles p
SET 
  email = u.email,
  username = COALESCE(
    p.username, -- Keep existing username if valid
    u.raw_user_meta_data->>'username', 
    split_part(u.email, '@', 1) -- Fallback to email prefix
  )
FROM auth.users u
WHERE p.id = u.id 
  AND (p.email IS NULL OR p.username IS NULL OR p.username = 'Unknown');

-- 4. Audit: Log the execution
DO $$
BEGIN
  RAISE NOTICE 'Profiles Backfill Completed. Checked for NULL or Unknown fields.';
END $$;
