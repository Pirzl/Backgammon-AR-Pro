-- Run this in Supabase SQL Editor to fix process_ai_match function
-- Copy and paste the ENTIRE content below

DROP FUNCTION IF EXISTS public.process_ai_match;

CREATE OR REPLACE FUNCTION public.process_ai_match(p_amount integer, p_user_won boolean, p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF p_user_won THEN
    UPDATE public.wallets SET saldo_actual = saldo_actual + p_amount WHERE user_id = p_user_id;
    INSERT INTO public.transactions (user_id, tipo, amount, description) VALUES (p_user_id, 'win', p_amount, 'Won against AI');
  ELSE
    UPDATE public.wallets SET saldo_actual = GREATEST(0, saldo_actual - p_amount) WHERE user_id = p_user_id;
    INSERT INTO public.transactions (user_id, tipo, amount, description) VALUES (p_user_id, 'loss', p_amount, 'Lost against AI');
  END IF;
  RETURN true;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.process_ai_match TO authenticated;
