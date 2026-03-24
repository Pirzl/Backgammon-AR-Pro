-- 1. Create a function to recover stuck points safely
CREATE OR REPLACE FUNCTION public.recover_stuck_points(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_stuck numeric;
BEGIN
    SELECT saldo_reservado INTO v_stuck
    FROM public.wallets
    WHERE user_id = p_user_id;
    
    IF v_stuck > 0 THEN
        UPDATE public.wallets
        SET 
            saldo_actual = saldo_actual + saldo_reservado,
            saldo_reservado = 0,
            updated_at = now()
        WHERE user_id = p_user_id;
        
        -- Log this as a refund transaction
        INSERT INTO public.transactions (
            user_id,
            tipo,
            points_ganados,
            saldo_antes,
            saldo_despues,
            descripcion
        ) VALUES (
            p_user_id,
            'refund',
            v_stuck,
            (SELECT saldo_actual - v_stuck FROM public.wallets WHERE user_id = p_user_id),
            (SELECT saldo_actual FROM public.wallets WHERE user_id = p_user_id),
            'Refund of stuck reserved stake'
        );
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create an admin function to safely gift points
CREATE OR REPLACE FUNCTION public.admin_gift_points(p_admin_id uuid, p_target_user_id uuid, p_amount numeric)
RETURNS boolean AS $$
DECLARE
    v_is_admin boolean;
    v_saldo_antes numeric;
BEGIN
    -- Verify admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only admins can gift points';
    END IF;
    
    -- Get balance before
    SELECT saldo_actual INTO v_saldo_antes FROM public.wallets WHERE user_id = p_target_user_id;
    
    -- Update wallet
    UPDATE public.wallets
    SET 
        saldo_actual = saldo_actual + p_amount,
        updated_at = now()
    WHERE user_id = p_target_user_id;
    
    -- Log transaction
    INSERT INTO public.transactions (
        user_id,
        tipo,
        points_ganados,
        saldo_antes,
        saldo_despues,
        descripcion
    ) VALUES (
        p_target_user_id,
        'initial', 
        p_amount,
        v_saldo_antes,
        v_saldo_antes + p_amount,
        'Admin gift'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the RPC for King of the Hill to fetch directly from wallets instead of profile.stats
CREATE OR REPLACE FUNCTION public.get_king_of_the_hill()
RETURNS json AS $$
DECLARE
  v_top_points json;
  v_top_streaks json;
BEGIN
  -- Top by points (fetching from wallets table)
  SELECT json_agg(json_build_object('name', p.username, 'points', w.saldo_actual))
  INTO v_top_points
  FROM public.profiles p
  JOIN public.wallets w ON p.id = w.user_id
  ORDER BY w.saldo_actual DESC NULLS LAST
  LIMIT 10;
  
  -- Top by streaks (can use existing stats logic if any, otherwise hardcode for now or skip)
  v_top_streaks := '[]'::json;

  RETURN json_build_object(
    'top_points', COALESCE(v_top_points, '[]'::json),
    'top_streaks', COALESCE(v_top_streaks, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
