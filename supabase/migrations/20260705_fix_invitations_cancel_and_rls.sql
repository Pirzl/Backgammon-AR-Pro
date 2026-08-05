-- Migration: Fix invitations cancellation + sender RLS
-- Description: Adds 'cancelled' to status CHECK constraint and allows senders to cancel pending invitations
-- Created: 2026-07-05

-- 1. ALTER CHECK CONSTRAINT to include 'cancelled'
ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_status_check;

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_status_check
CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled'));

-- 2. ADD RLS POLICY: Senders can cancel own pending invitations
DROP POLICY IF EXISTS "Senders can cancel own pending invitations" ON public.invitations;
CREATE POLICY "Senders can cancel own pending invitations"
    ON public.invitations FOR UPDATE
    TO authenticated
    USING (sender_id = auth.uid() AND status = 'pending')
    WITH CHECK (sender_id = auth.uid() AND status = 'cancelled');

-- 3. UPDATE the trigger condition to also prevent trigger on cancelled
-- The trigger handle_invitation_accepted only fires when status = 'accepted',
-- so 'cancelled' will not interfere. No change needed.
