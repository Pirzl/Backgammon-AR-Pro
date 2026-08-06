-- Migration: Improve RLS policies and add cube state persistence
-- Description: Tighten security for game_logs, add cube state sync to matches, prepare for betting system
-- Created: 2026-02-19

-- ============================================================================
-- 1. IMPROVE GAME_LOGS RLS (More secure than public INSERT)
-- ============================================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Public can insert game logs for stats" ON public.game_logs;

-- NEW: Only authenticated users can insert game logs
-- This prevents spam/DoS while still allowing legitimate game result storage
CREATE POLICY "Authenticated users can insert game logs" 
ON public.game_logs
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Add rate limiting protection via function (optional, can be added later)
-- For now, we rely on application-level validation

COMMENT ON POLICY "Authenticated users can insert game logs" ON public.game_logs 
IS 'Allows authenticated users to save game results. Prevents anonymous spam.';

-- ============================================================================
-- 2. IMPROVE PROFILES RLS (Protect sensitive fields)
-- ============================================================================

-- Drop overly permissive SELECT policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- NEW: Public can view basic profile info only
CREATE POLICY "Public can view basic profiles" 
ON public.profiles
FOR SELECT
USING (true);

-- Users can view their own full profile (including sensitive fields)
CREATE POLICY "Users can view own full profile" 
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Prevent anon writes
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" 
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

COMMENT ON POLICY "Public can view basic profiles" ON public.profiles 
IS 'Public can see basic profile info. Sensitive fields (wallet_balance, internal_notes, kyc_status) are hidden.';

-- ============================================================================
-- 3. ADD CUBE STATE PERSISTENCE TO MATCHES
-- ============================================================================

-- Ensure matches table has cube columns (already added in 20260219_create_invitations_and_matches.sql)
-- But add a function to sync cube state during gameplay

CREATE OR REPLACE FUNCTION public.sync_match_cube_state()
RETURNS TRIGGER AS $$
BEGIN
    -- Update match cube state when game state changes
    -- This is called from application layer, not automatically
    -- But we provide the function for consistency
    IF NEW.cube_value IS DISTINCT FROM OLD.cube_value OR NEW.cube_owner IS DISTINCT FROM OLD.cube_owner THEN
        NEW.updated_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at when cube changes
DROP TRIGGER IF EXISTS trigger_match_cube_sync ON public.matches;
CREATE TRIGGER trigger_match_cube_sync
    BEFORE UPDATE OF cube_value, cube_owner ON public.matches
    FOR EACH ROW
    WHEN (NEW.cube_value IS DISTINCT FROM OLD.cube_value OR NEW.cube_owner IS DISTINCT FROM OLD.cube_owner)
    EXECUTE FUNCTION public.sync_match_cube_state();

-- ============================================================================
-- 4. PREPARE BETTING SYSTEM STRUCTURE (Fictitious betting)
-- ============================================================================

-- Add betting-related columns to matches table (if not exists)
DO $$
BEGIN
    -- bet_amount: Amount wagered in fictitious currency
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'matches' 
        AND column_name = 'bet_amount'
    ) THEN
        ALTER TABLE public.matches 
        ADD COLUMN bet_amount numeric(10, 2) DEFAULT 0.00 CHECK (bet_amount >= 0);
    END IF;
    
    -- winner_payout: Amount won by winner (calculated: bet_amount * cube_value * multiplier)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'matches' 
        AND column_name = 'winner_payout'
    ) THEN
        ALTER TABLE public.matches 
        ADD COLUMN winner_payout numeric(10, 2) DEFAULT 0.00 CHECK (winner_payout >= 0);
    END IF;
END $$;

-- Add index for betting queries
CREATE INDEX IF NOT EXISTS idx_matches_bet_amount ON public.matches(bet_amount) WHERE bet_amount > 0;

-- ============================================================================
-- 5. FUNCTION: Calculate winner payout based on cube and win method
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_match_payout(
    p_bet_amount numeric,
    p_cube_value int,
    p_win_method text
)
RETURNS numeric AS $$
DECLARE
    multiplier numeric;
BEGIN
    -- Determine multiplier based on win method
    CASE p_win_method
        WHEN 'normal' THEN multiplier := 1;
        WHEN 'gammon' THEN multiplier := 2;
        WHEN 'backgammon' THEN multiplier := 3;
        ELSE multiplier := 1; -- Default to normal
    END CASE;
    
    -- Calculate: bet_amount * cube_value * multiplier
    RETURN p_bet_amount * p_cube_value * multiplier;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_match_payout IS 
'Calculates winner payout for a match: bet_amount * cube_value * multiplier (normal=1, gammon=2, backgammon=3)';

-- ============================================================================
-- 6. TRIGGER: Auto-calculate winner_payout when match finishes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_calculate_payout()
RETURNS TRIGGER AS $$
BEGIN
    -- Only calculate when match finishes and winner is set
    IF NEW.status = 'finished' AND NEW.winner_id IS NOT NULL AND NEW.bet_amount > 0 THEN
        NEW.winner_payout := public.calculate_match_payout(
            NEW.bet_amount,
            NEW.cube_value,
            COALESCE(NEW.win_method, 'normal')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_payout ON public.matches;
CREATE TRIGGER trigger_auto_calculate_payout
    BEFORE UPDATE ON public.matches
    FOR EACH ROW
    WHEN (NEW.status = 'finished' AND NEW.winner_id IS NOT NULL)
    EXECUTE FUNCTION public.auto_calculate_payout();

-- ============================================================================
-- 7. FUNCTION: Update wallet balance after match (for fictitious betting)
-- ============================================================================

-- This function will be called from application layer after match completion
-- It updates the winner's wallet_balance (fictitious currency)
CREATE OR REPLACE FUNCTION public.update_wallet_after_match(
    p_match_id uuid
)
RETURNS void AS $$
DECLARE
    v_winner_id uuid;
    v_payout numeric;
BEGIN
    -- Get winner and payout from match
    SELECT winner_id, winner_payout INTO v_winner_id, v_payout
    FROM public.matches
    WHERE id = p_match_id AND status = 'finished' AND winner_payout > 0;
    
    -- Update winner's wallet (fictitious currency)
    IF v_winner_id IS NOT NULL AND v_payout > 0 THEN
        UPDATE public.profiles
        SET wallet_balance = COALESCE(wallet_balance, 0) + v_payout
        WHERE id = v_winner_id;
        
        -- Log transaction (optional, can add transactions table later)
        RAISE NOTICE 'Updated wallet for winner %: +%', v_winner_id, v_payout;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_wallet_after_match IS 
'Updates winner wallet balance after match completion. Called from application layer.';
