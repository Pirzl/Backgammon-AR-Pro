-- 2026-08-03: Enable Supabase Realtime for the tables the app subscribes to.
-- Without this, every `postgres_changes` subscription silently never fires:
-- invitation inbox refresh, match-abandonment detection, opponent wallet updates,
-- unread message counts, tournament/admin dashboards, presence and settings sync.
--
-- Only `messages` was previously in the publication (20260208_crm_messaging.sql).
--
-- HOW TO APPLY: paste this file into the Supabase SQL Editor (idempotent, safe to
-- re-run). Realtime also respects RLS: events are only delivered for rows the
-- subscriber is allowed to read, so the wallets RLS policy (see
-- 20260803_wallets_balance_read_rls.sql) is required for opponent-balance events.

DO $$
DECLARE
  t text;
  tables_to_add text[] := ARRAY[
    'wallets', 'matches', 'invitations', 'game_logs', 'cube_history',
    'user_device_alerts', 'profiles', 'notifications', 'tournaments', 'app_settings'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Publication supabase_realtime does not exist';
  END IF;

  FOREACH t IN ARRAY tables_to_add LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    ELSE
      RAISE NOTICE 'Already published: %', t;
    END IF;
  END LOOP;
END $$;
