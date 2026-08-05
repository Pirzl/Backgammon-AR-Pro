-- =============================================================================
-- 2026-08-05 — Presence / online-offline fix (CRM)
--
-- Root cause: profiles.status is only reset to 'offline' on clean logout /
-- beforeunload, which does not fire reliably on mobile/crash. So the sticky
-- 'online' value made users appear online forever (heartbeats keep last_seen
-- fresh but never flip status back). All client detection now derives online
-- from last_seen recency (60s); this migration cleans the stale column and
-- keeps server-side aggregates consistent.
--
-- NOTE: the Supabase SQL Editor executes the whole pasted script as ONE
-- transaction, so any failing statement reverts everything. To avoid the
-- function being rolled back, this script creates the function and runs the
-- sweep FIRST, and rebuilds the view with DROP + CREATE (never OR REPLACE).
-- =============================================================================

-- 1. RPC to sweep stale presence: mark offline users whose heartbeat is stale.
CREATE OR REPLACE FUNCTION public.cleanup_stale_presences()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated integer;
BEGIN
    UPDATE public.profiles
    SET status = 'offline'
    WHERE status IN ('online', 'active', 'in-game')
      AND (last_seen IS NULL OR last_seen < now() - interval '60 seconds');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_presences IS
'Sets profiles.status=offline for users whose last_seen heartbeat is older than 60s.';

-- Allow anon + authenticated to invoke it (idempotent, safe to run on demand).
GRANT EXECUTE ON FUNCTION public.cleanup_stale_presences() TO anon, authenticated;

-- 2. Run once now to immediately fix users stuck online (returns the count).
SELECT public.cleanup_stale_presences();

-- 3. Fix admin_stats_view: active_users_count must be derived from heartbeat
--    recency ONLY (drop the sticky status='online' OR-term).
DROP VIEW IF EXISTS public.admin_stats_view;
CREATE VIEW public.admin_stats_view AS
SELECT
    (SELECT COUNT(*) FROM public.profiles WHERE last_seen > now() - interval '60 seconds') as active_users_count,
    (SELECT COUNT(*) FROM public.profiles) as total_users,
    (SELECT COALESCE(SUM(buy_in * current_players), 0) FROM public.tournaments) as total_entry_fees_collected,
    (SELECT COALESCE(SUM(prize_won), 0) FROM public.tournament_participants) as total_prizes_distributed,
    (SELECT COUNT(*) FROM public.tournaments WHERE status = 'Completed') as tournaments_completed;

-- 4. (Optional) Automate the sweep every 30s via pg_cron, if the extension is
--    enabled in the Supabase project. Uncomment if pg_cron is available:
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--    SELECT cron.schedule('cleanup-stale-presences', '*/30 * * * * *',
--      'SELECT public.cleanup_stale_presences();');
