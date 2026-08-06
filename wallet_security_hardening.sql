-- Wallet security hardening for VIVO Supabase
-- Run this in Supabase SQL Editor after supabase_wallets_setup.sql

-- 1. Prevent negative balances at the DB level
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_saldo_actual_nonnegative CHECK (saldo_actual >= 0);

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_saldo_reservado_nonnegative CHECK (saldo_reservado >= 0);

-- 2. Safer reserve_stake with row lock
CREATE OR REPLACE FUNCTION public.reserve_stake(p_user_id uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_actual integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid reserve amount';
  END IF;

  SELECT saldo_actual INTO v_saldo_actual
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_saldo_actual < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.wallets
  SET saldo_actual = saldo_actual - p_amount,
      saldo_reservado = saldo_reservado + p_amount,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet update failed';
  END IF;

  RETURN TRUE;
END;
$$;

-- 3. Safer release_stake: never release more than reserved
CREATE OR REPLACE FUNCTION public.release_stake(p_user_id uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_reservado integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT saldo_reservado INTO v_saldo_reservado
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_saldo_reservado < p_amount THEN
    RAISE EXCEPTION 'Cannot release more than reserved';
  END IF;

  UPDATE public.wallets
  SET saldo_actual = saldo_actual + p_amount,
      saldo_reservado = saldo_reservado - p_amount,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet update failed';
  END IF;

  RETURN TRUE;
END;
$$;

-- 4. Safer update_reserved_stake
CREATE OR REPLACE FUNCTION public.update_reserved_stake(p_user_id uuid, p_new_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_actual integer;
  v_current_reserved integer;
  v_difference integer;
BEGIN
  IF p_new_amount < 0 THEN
    RAISE EXCEPTION 'Invalid reserved amount';
  END IF;

  SELECT saldo_actual, saldo_reservado INTO v_saldo_actual, v_current_reserved
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  v_difference := p_new_amount - v_current_reserved;

  IF v_difference > 0 AND v_saldo_actual < v_difference THEN
    RAISE EXCEPTION 'Insufficient balance for additional stake';
  END IF;

  UPDATE public.wallets
  SET saldo_actual = saldo_actual - v_difference,
      saldo_reservado = p_new_amount,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet update failed';
  END IF;

  RETURN TRUE;
END;
$$;

-- 5. Drop the old match-result function before recreating it
DROP FUNCTION IF EXISTS public.process_match_result(uuid);

CREATE OR REPLACE FUNCTION public.process_match_result(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match record;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_payout integer;
  v_prev_loser_saldo integer;
  v_prev_winner_saldo integer;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status = 'completed' THEN
    RETURN TRUE;
  END IF;

  IF v_match.winner_color = 'white' THEN
    v_winner_id := v_match.player_white;
    v_loser_id := v_match.player_black;
  ELSE
    v_winner_id := v_match.player_black;
    v_loser_id := v_match.player_white;
  END IF;

  v_winner_payout := v_match.winner_payout;

  SELECT saldo_actual INTO v_prev_loser_saldo FROM public.wallets WHERE user_id = v_loser_id FOR UPDATE;
  SELECT saldo_actual INTO v_prev_winner_saldo FROM public.wallets WHERE user_id = v_winner_id FOR UPDATE;

  IF v_prev_loser_saldo IS NULL OR v_prev_winner_saldo IS NULL THEN
    RAISE EXCEPTION 'Wallet missing for match participants';
  END IF;

  IF v_prev_loser_saldo < greatest(v_winner_payout - (SELECT saldo_reservado FROM public.wallets WHERE user_id = v_loser_id), 0) THEN
    RAISE EXCEPTION 'Loser balance would go negative';
  END IF;

  UPDATE public.wallets
  SET saldo_actual = saldo_actual - (greatest(v_winner_payout - saldo_reservado, 0)),
      saldo_reservado = 0,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_loser_id;

  INSERT INTO public.transactions (user_id, match_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
  SELECT v_loser_id, p_match_id, 'loss', v_winner_payout, v_prev_loser_saldo, v_prev_loser_saldo - greatest(v_winner_payout - (SELECT saldo_reservado FROM public.wallets WHERE user_id = v_loser_id), 0), 'Lost match';

  UPDATE public.wallets
  SET saldo_actual = saldo_actual + saldo_reservado + v_winner_payout,
      saldo_reservado = 0,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_winner_id;

  INSERT INTO public.transactions (user_id, match_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
  SELECT v_winner_id, p_match_id, 'win', v_winner_payout, v_prev_winner_saldo, v_prev_winner_saldo + (SELECT saldo_reservado FROM public.wallets WHERE user_id = v_winner_id) + v_winner_payout, 'Won match';

  UPDATE public.matches SET status = 'completed' WHERE id = p_match_id;

  RETURN TRUE;
END;
$$;
