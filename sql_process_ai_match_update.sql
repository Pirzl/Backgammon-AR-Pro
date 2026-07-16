DROP FUNCTION IF EXISTS public.process_ai_match(integer, boolean);
DROP FUNCTION IF EXISTS public.process_ai_match(integer, boolean, uuid);

CREATE OR REPLACE FUNCTION public.process_ai_match(p_amount integer, p_user_won boolean, p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_balance integer;
  v_actual_deduction integer;
  v_current_streak integer;
  v_max_streak integer;
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  -- 1. Get Wallet
  SELECT saldo_actual INTO v_current_balance 
  FROM public.wallets 
  WHERE user_id = v_user_id 
  FOR UPDATE;

  -- 2. Get Streaks
  SELECT current_ai_win_streak, max_ai_win_streak 
  INTO v_current_streak, v_max_streak
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;
  
  -- Handle NULLs just in case
  v_current_streak := COALESCE(v_current_streak, 0);
  v_max_streak := COALESCE(v_max_streak, 0);

  -- 3. Get currently reserved stake
  SELECT saldo_reservado INTO v_actual_deduction 
  FROM public.wallets 
  WHERE user_id = v_user_id;
  
  v_actual_deduction := COALESCE(v_actual_deduction, 0);

  IF p_user_won THEN
    -- A. USER WINS
    v_current_streak := v_current_streak + 1;
    IF v_current_streak > v_max_streak THEN
      v_max_streak := v_current_streak;
    END IF;

    -- Standard Payout: Return reserved + award amount
    UPDATE public.wallets 
    SET 
      saldo_actual = saldo_actual + v_actual_deduction + p_amount, 
      saldo_reservado = 0,
      updated_at = now()
    WHERE user_id = v_user_id;
    
    INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
    VALUES (v_user_id, 'win', p_amount, v_current_balance, v_current_balance + v_actual_deduction + p_amount, 'Won against AI');

    -- B. THE BOUNTY CHECK (3 WINS = 1500 POINTS)
    IF v_current_streak = 3 THEN
      UPDATE public.wallets 
      SET saldo_actual = saldo_actual + 1500, updated_at = now()
      WHERE user_id = v_user_id;
      
      INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
      VALUES (v_user_id, 'bonus', 1500, v_current_balance + v_actual_deduction + p_amount, v_current_balance + v_actual_deduction + p_amount + 1500, 'Bounty: Beat Grandmaster 3 times');
      
      -- Reset streak after bounty
      v_current_streak := 0;
    END IF;

  ELSE
    -- C. USER LOSES
    v_current_streak := 0; -- Reset streak
    
    -- Calculate excess deduction if it's a Gammon/Backgammon (p_amount > v_actual_deduction)
    -- p_amount already has the cube * multiplier logic from frontend
    IF p_amount > v_actual_deduction THEN
      UPDATE public.wallets 
      SET 
        saldo_actual = saldo_actual - (p_amount - v_actual_deduction),
        saldo_reservado = 0,
        updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      -- Normal win or lower: Just clear reserved
      UPDATE public.wallets 
      SET 
        saldo_reservado = 0,
        updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
      
    INSERT INTO public.transactions (user_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
    VALUES (v_user_id, 'loss', p_amount, v_current_balance, v_current_balance - (greatest(p_amount - v_actual_deduction, 0)), 'Lost against AI');
  END IF;

  -- 3. Update Profiles with new streak
  UPDATE public.profiles
  SET 
    current_ai_win_streak = v_current_streak,
    max_ai_win_streak = v_max_streak
  WHERE id = v_user_id;

  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.process_ai_match TO authenticated;
