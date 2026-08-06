-- Migration: Complete Betting System Tables
-- Description: Creates cube_history, wallets, and transactions tables for fictitious betting system
-- Created: 2026-02-19

-- ============================================================================
-- 1. WALLETS TABLE (Virtual Wallet for Fictitious Currency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wallets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    saldo_actual numeric(10, 2) DEFAULT 5000.00 CHECK (saldo_actual >= 0),
    saldo_reservado numeric(10, 2) DEFAULT 0.00 CHECK (saldo_reservado >= 0),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);

-- RLS Policies
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;
DROP POLICY IF EXISTS "System can create wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.wallets;

-- Users can view their own wallet
CREATE POLICY "Users can view own wallet"
    ON public.wallets FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Do NOT allow direct client writes: use server-side functions only
CREATE POLICY "System can insert wallets"
    ON public.wallets FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can update wallets"
    ON public.wallets FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can view all wallets
CREATE POLICY "Admins can view all wallets"
    ON public.wallets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Trigger: Auto-create wallet when profile is created
CREATE OR REPLACE FUNCTION public.create_wallet_on_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id, saldo_actual)
    VALUES (NEW.id, 5000.00)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_wallet ON public.profiles;
CREATE TRIGGER trigger_create_wallet
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.create_wallet_on_profile();

-- ============================================================================
-- 2. CUBE_HISTORY TABLE (History of Doubling Cube Actions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cube_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    accion text NOT NULL CHECK (accion IN ('offer', 'accept', 'deny')),
    valor_cubo int NOT NULL CHECK (valor_cubo IN (1, 2, 4, 8, 16, 32, 64)),
    cube_owner_before text CHECK (cube_owner_before IN ('white', 'black')),
    cube_owner_after text CHECK (cube_owner_after IN ('white', 'black')),
    timestamp timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cube_history_match ON public.cube_history(match_id);
CREATE INDEX IF NOT EXISTS idx_cube_history_actor ON public.cube_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_cube_history_timestamp ON public.cube_history(timestamp DESC);

-- RLS Policies
ALTER TABLE public.cube_history ENABLE ROW LEVEL SECURITY;

-- Users can view cube history for matches they participated in
DROP POLICY IF EXISTS "Users can view own match cube history" ON public.cube_history;
CREATE POLICY "Users can view own match cube history"
    ON public.cube_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = cube_history.match_id
            AND (m.player_white = auth.uid() OR m.player_black = auth.uid())
        )
    );

-- Authenticated users can insert cube history (for their own actions)
DROP POLICY IF EXISTS "Users can insert cube history" ON public.cube_history;
CREATE POLICY "Users can insert cube history"
    ON public.cube_history FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid());

-- Admins can view all cube history
DROP POLICY IF EXISTS "Admins can view all cube history" ON public.cube_history;
CREATE POLICY "Admins can view all cube history"
    ON public.cube_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- 3. TRANSACTIONS TABLE (Wallet Transactions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
    tx_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('bet', 'win', 'loss', 'refund', 'initial')),
    points_ganados numeric(10, 2) DEFAULT 0.00 CHECK (points_ganados >= 0),
    points_perdidos numeric(10, 2) DEFAULT 0.00 CHECK (points_perdidos >= 0),
    saldo_antes numeric(10, 2) NOT NULL,
    saldo_despues numeric(10, 2) NOT NULL,
    descripcion text,
    timestamp timestamptz DEFAULT now(),
    synced_to_crm boolean DEFAULT false,
    crm_sync_timestamp timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_match ON public.transactions(match_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_crm_sync ON public.transactions(synced_to_crm) WHERE synced_to_crm = false;

-- RLS Policies
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- System can insert transactions (via functions)
DROP POLICY IF EXISTS "System can insert transactions" ON public.transactions;
CREATE POLICY "System can insert transactions"
    ON public.transactions FOR INSERT
    TO authenticated
    WITH CHECK (true); -- Transactions are created by system functions

-- Admins can view all transactions
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- 4. UPDATE MATCHES TABLE (Add stake_inicial column)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'matches' 
        AND column_name = 'stake_inicial'
    ) THEN
        ALTER TABLE public.matches 
        ADD COLUMN stake_inicial numeric(10, 2) DEFAULT 100.00 CHECK (stake_inicial >= 0);
    END IF;
END $$;

-- ============================================================================
-- 5. FUNCTIONS FOR WALLET OPERATIONS
-- ============================================================================

-- Function: Reserve stake for a match
CREATE OR REPLACE FUNCTION public.reserve_stake(
    p_user_id uuid,
    p_amount numeric
)
RETURNS boolean AS $$
DECLARE
    v_current_balance numeric;
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL OR v_caller <> p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Get current balance
    SELECT saldo_actual INTO v_current_balance
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user has enough balance
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance. Current: %, Required: %', v_current_balance, p_amount;
    END IF;
    
    -- Reserve the amount
    UPDATE public.wallets
    SET 
        saldo_reservado = saldo_reservado + p_amount,
        saldo_actual = saldo_actual - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update reserved stake when cube doubles
CREATE OR REPLACE FUNCTION public.update_reserved_stake(
    p_user_id uuid,
    p_new_amount numeric
)
RETURNS boolean AS $$
DECLARE
    v_current_reserved numeric;
    v_difference numeric;
BEGIN
    -- Get current reserved amount
    SELECT saldo_reservado INTO v_current_reserved
    FROM public.wallets
    WHERE user_id = p_user_id;
    
    -- Calculate difference
    v_difference := p_new_amount - v_current_reserved;
    
    -- If new amount is higher, reserve more
    IF v_difference > 0 THEN
        UPDATE public.wallets
        SET 
            saldo_reservado = p_new_amount,
            saldo_actual = saldo_actual - v_difference,
            updated_at = now()
        WHERE user_id = p_user_id;
    ELSE
        -- If new amount is lower (shouldn't happen, but handle it)
        UPDATE public.wallets
        SET 
            saldo_reservado = p_new_amount,
            saldo_actual = saldo_actual + ABS(v_difference),
            updated_at = now()
        WHERE user_id = p_user_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Process match result and update wallets
CREATE OR REPLACE FUNCTION public.process_match_result(
    p_match_id uuid
)
RETURNS void AS $$
DECLARE
    v_match_record RECORD;
    v_winner_id uuid;
    v_loser_id uuid;
    v_stake_inicial numeric;
    v_cube_final int;
    v_win_method text;
    v_total_payout numeric;
    v_winner_wallet_before numeric;
    v_loser_wallet_before numeric;
    v_winner_wallet_after numeric;
    v_loser_wallet_after numeric;
    v_caller uuid := auth.uid();
BEGIN
    -- Only allow authenticated calls
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Get match details and enforce caller is a participant
    SELECT 
        player_white,
        player_black,
        winner_id,
        stake_inicial,
        cube_value,
        win_method,
        winner_payout,
        status
    INTO v_match_record
    FROM public.matches
    WHERE id = p_match_id
      AND status = 'finished'
      AND (player_white = v_caller OR player_black = v_caller);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match not found, not finished, or caller is not a participant';
    END IF;

    -- Idempotency: skip if already processed
    IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE match_id = p_match_id
          AND tipo IN ('win', 'loss')
    ) THEN
        RETURN;
    END IF;

    -- Determine winner and loser
    v_winner_id := v_match_record.winner_id;
    v_loser_id := CASE 
        WHEN v_match_record.winner_id = v_match_record.player_white 
        THEN v_match_record.player_black 
        ELSE v_match_record.player_white 
    END;

    v_stake_inicial := COALESCE(v_match_record.stake_inicial, 100.00);
    v_cube_final := COALESCE(v_match_record.cube_value, 1);
    v_win_method := COALESCE(v_match_record.win_method, 'normal');
    v_total_payout := COALESCE(v_match_record.winner_payout, 0);

    -- Get wallet balances before
    SELECT saldo_actual INTO v_winner_wallet_before FROM public.wallets WHERE user_id = v_winner_id;
    SELECT saldo_actual INTO v_loser_wallet_before FROM public.wallets WHERE user_id = v_loser_id;

    -- Release reserved stake from both players
    UPDATE public.wallets
    SET saldo_reservado = saldo_reservado - v_stake_inicial * v_cube_final
    WHERE user_id IN (v_winner_id, v_loser_id);

    -- Winner gets payout
    UPDATE public.wallets
    SET 
        saldo_actual = saldo_actual + v_total_payout,
        updated_at = now()
    WHERE user_id = v_winner_id;

    -- Get wallet balances after
    SELECT saldo_actual INTO v_winner_wallet_after FROM public.wallets WHERE user_id = v_winner_id;
    SELECT saldo_actual INTO v_loser_wallet_after FROM public.wallets WHERE user_id = v_loser_id;

    -- Create transaction for winner
    INSERT INTO public.transactions (
        match_id,
        user_id,
        tipo,
        points_ganados,
        saldo_antes,
        saldo_despues,
        descripcion
    ) VALUES (
        p_match_id,
        v_winner_id,
        'win',
        v_total_payout,
        v_winner_wallet_before,
        v_winner_wallet_after,
        format('Won match: stake=%s, cube=%s, method=%s', v_stake_inicial, v_cube_final, v_win_method)
    );

    -- Create transaction for loser
    INSERT INTO public.transactions (
        match_id,
        user_id,
        tipo,
        points_perdidos,
        saldo_antes,
        saldo_despues,
        descripcion
    ) VALUES (
        p_match_id,
        v_loser_id,
        'loss',
        v_stake_inicial * v_cube_final,
        v_loser_wallet_before,
        v_loser_wallet_after,
        format('Lost match: stake=%s, cube=%s', v_stake_inicial, v_cube_final)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reserve_stake IS 'Reserves stake amount from user wallet';
COMMENT ON FUNCTION public.update_reserved_stake IS 'Updates reserved stake when cube doubles';
COMMENT ON FUNCTION public.process_match_result IS 'Processes match result and updates wallets/transactions';
