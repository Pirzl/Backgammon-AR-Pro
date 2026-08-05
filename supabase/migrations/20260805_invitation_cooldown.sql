-- Migration: H2H invitation cooldown + updated_at maintenance
-- Description:
--  1. Refresh `updated_at` on every UPDATE to `invitations` (so rejections are
--     timestamped, not just the original invite creation time).
--  2. Enforce a 5-minute cooldown server-side: a player cannot re-invite the
--     same opponent within 5 minutes of a previous rejected/cancelled invite.

-- ── 1. Keep updated_at fresh on UPDATE ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_invitations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitations_set_updated_at ON public.invitations;
CREATE TRIGGER trg_invitations_set_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invitations_updated_at();

-- ── 2. Cooldown: block re-invite within 5 min after a rejection/cancel ─────
CREATE OR REPLACE FUNCTION public.check_invitation_cooldown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invitations
    WHERE sender_id = NEW.sender_id
      AND receiver_id = NEW.receiver_id
      AND status IN ('rejected', 'cancelled')
      AND updated_at > now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Debes esperar 5 minutos tras un rechazo antes de volver a invitar a este jugador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitations_cooldown ON public.invitations;
CREATE TRIGGER trg_invitations_cooldown
  BEFORE INSERT ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_invitation_cooldown();