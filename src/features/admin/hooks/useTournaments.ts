import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';
import type { Tournament } from '../../../entities/tournament/types';

export const useTournaments = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error fetching tournaments:', error);
    } else {
      setTournaments(data.map((t) => ({
        id: t.id,
        name: t.name,
        format: t.format,
        status: t.status,
        startDate: t.start_date,
        buyIn: t.buy_in,
        prizePool: t.prize_pool,
        maxPlayers: t.max_players,
        currentPlayers: t.current_players,
        seriesLength: t.series_length,
        inviteStrategy: t.invite_strategy,
        createdAt: t.created_at
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const doFetch = async () => {
      if (mounted) await fetchTournaments();
    };

    void doFetch();
    
    // Subscribe to changes
    const channel = supabase
      .channel('public:tournaments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => {
        void doFetch();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [fetchTournaments]);

  const createTournament = async (t: Partial<Tournament>) => {
    const { error } = await supabase.from('tournaments').insert([{
      name: t.name,
      format: t.format,
      start_date: t.startDate,
      buy_in: t.buyIn,
      prize_pool: t.prizePool,
      max_players: t.maxPlayers,
      series_length: t.seriesLength,
      invite_strategy: t.inviteStrategy
    }]);

    if (error) throw error;
  };

  const archiveTournament = async (id: string) => {
    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'Archived' })
      .eq('id', id);
    
    if (error) throw error;
  };
  
  const toggleStatus = async (id: string, currentStatus: string) => {
      const newStatus = currentStatus === 'Cancelled' ? 'Open' : 'Cancelled';
      const { error } = await supabase
        .from('tournaments')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
  };

  return { tournaments, loading, createTournament, archiveTournament, toggleStatus };
};
