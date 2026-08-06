-- 1. Create a function to recover stuck points safely
CREATE OR REPLACE FUNCTION public.recover_stuck_points(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_stuck numeric;
    v_saldo numeric;
    v_caller uuid := auth.uid();
    v_recovered boolean := false;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT saldo_reservado, saldo_actual
    INTO v_stuck, v_saldo
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_stuck > 0 THEN
        UPDATE public.wallets
        SET 
            saldo_actual = saldo_actual + saldo_reservado,
            saldo_reservado = 0,
            updated_at = now()
        WHERE user_id = p_user_id;

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
            v_saldo,
            v_saldo + v_stuck,
            'Refund of stuck reserved stake'
        );

        v_recovered := true;
    END IF;

    RETURN v_recovered;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create an admin function to safely gift points
CREATE OR REPLACE FUNCTION public.admin_gift_points(p_admin_id uuid, p_target_user_id uuid, p_amount numeric)
RETURNS boolean AS $$
DECLARE
    v_is_admin boolean;
    v_saldo_antes numeric;
    v_saldo_despues numeric;
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL OR v_caller <> p_admin_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only admins can gift points';
    END IF;

    IF p_admin_id = p_target_user_id THEN
        RAISE EXCEPTION 'Admin cannot gift points to self';
    END IF;

    SELECT saldo_actual INTO v_saldo_antes
    FROM public.wallets
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target wallet not found';
    END IF;

    UPDATE public.wallets
    SET 
        saldo_actual = saldo_actual + p_amount,
        updated_at = now()
    WHERE user_id = p_target_user_id
    RETURNING saldo_actual INTO v_saldo_despues;

    INSERT INTO public.transactions (
        user_id,
        tipo,
        points_ganados,
        saldo_antes,
        saldo_despues,
        descripcion
    ) VALUES (
        p_target_user_id,
        'admin_gift',
        p_amount,
        v_saldo_antes,
        v_saldo_despues,
        format('Admin gift from %s', p_admin_id)
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
