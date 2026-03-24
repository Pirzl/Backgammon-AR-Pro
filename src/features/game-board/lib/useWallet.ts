/**
 * Wallet Hook
 * Manages virtual wallet operations for betting system
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { useAuth } from '../../auth/useAuth';

interface WalletState {
  saldo_actual: number;
  saldo_reservado: number;
  loading: boolean;
  error: string | null;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletState>({
    saldo_actual: 500,
    saldo_reservado: 0,
    loading: true,
    error: null,
  });

  // Fetch wallet on mount and when user changes
  useEffect(() => {
    if (!user?.id) {
      setWallet({ saldo_actual: 500, saldo_reservado: 0, loading: false, error: null });
      return;
    }

    const fetchWallet = async () => {
      try {
        const { data, error } = await supabase
          .from('wallets')
          .select('saldo_actual, saldo_reservado')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          throw error;
        }

        if (data) {
          setWallet({
            saldo_actual: data.saldo_actual || 500,
            saldo_reservado: data.saldo_reservado || 0,
            loading: false,
            error: null,
          });
        } else {
          // Wallet doesn't exist, create it
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: user.id, saldo_actual: 500 })
            .select()
            .single();

          if (createError) throw createError;

          setWallet({
            saldo_actual: newWallet.saldo_actual || 500,
            saldo_reservado: newWallet.saldo_reservado || 0,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        console.error('Error fetching wallet:', err);
        setWallet(prev => ({ ...prev, loading: false, error: 'Error loading wallet' }));
      }
    };

    fetchWallet();

    // Subscribe to wallet changes
    const channel = supabase
      .channel('wallet-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setWallet(prev => ({
            saldo_actual: typeof payload.new.saldo_actual === 'number' ? payload.new.saldo_actual : prev.saldo_actual,
            saldo_reservado: typeof payload.new.saldo_reservado === 'number' ? payload.new.saldo_reservado : prev.saldo_reservado,
            loading: false,
            error: null,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const reserveStake = useCallback(async (amount: number): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase.rpc('reserve_stake', {
        p_user_id: user.id,
        p_amount: amount,
      });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error reserving stake:', err);
      return false;
    }
  }, [user?.id]);

  const updateReservedStake = useCallback(async (newAmount: number): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase.rpc('update_reserved_stake', {
        p_user_id: user.id,
        p_new_amount: newAmount,
      });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error updating reserved stake:', err);
      return false;
    }
  }, [user?.id]);

  // Fetch wallet manually
  const refresh = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('saldo_actual, saldo_reservado')
        .eq('user_id', user.id)
        .single();
        
      if (!error && data) {
        setWallet({
          saldo_actual: data.saldo_actual || 500,
          saldo_reservado: data.saldo_reservado || 0,
          loading: false,
          error: null,
        });
      }
    } catch (err) {
      console.error('Error refreshing wallet:', err);
    }
  }, [user?.id]);

  return {
    ...wallet,
    reserveStake,
    updateReservedStake,
    refresh
  };
}
