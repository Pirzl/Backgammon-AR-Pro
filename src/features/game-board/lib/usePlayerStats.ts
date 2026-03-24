import { useState, useEffect } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { useAuth } from '../../auth/useAuth';

export interface PlayerStats {
  wins: number;
  losses: number;
  rank: string;
  loading: boolean;
}

export function usePlayerStats() {
  const { user } = useAuth();

  const [stats, setStats] = useState<PlayerStats>(() => ({
    wins: 0,
    losses: 0,
    rank: user ? 'Loading...' : '-',
    loading: !!user
  }));

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      // Reset stats to loading state when user changes/mounts
      setStats(prev => ({ 
        ...prev, 
        loading: true,
        rank: 'Loading...',
        wins: 0,
        losses: 0 
      }));

      try {
        // 1. Fetch Profile for Rank (and potentially stats if we add them to profile later)
        const { data: profile } = await supabase
          .from('profiles')
          .select('skill_rating, tournaments_won, tournaments_played') // specific fields
          .eq('id', user.id)
          .single();

        // 2. Count Wins from Game Logs
        // Correct syntax: or('and(A,B),and(C,D)')
        const { count: winsCount, error: winsError } = await supabase
          .from('game_logs')
          .select('*', { count: 'exact', head: true })
          .or(`and(winner.eq.white,white_player_id.eq.${user.id}),and(winner.eq.black,black_player_id.eq.${user.id})`);

        if (winsError) console.error('Error counting wins:', winsError);

        // 3. Count Losses from Game Logs
        // Loss = I played but I wasn't the winner
        // (Assuming completed games have a winner)
        const { count: totalGames, error: totalError } = await supabase
          .from('game_logs')
          .select('*', { count: 'exact', head: true })
          .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`);
        
        if (totalError) console.error('Error counting total games:', totalError);

        const wins = winsCount || 0;
        const total = totalGames || 0;
        const losses = Math.max(0, total - wins);

        // Rank Logic (Simplified or derived)
        // You might want to import calculateRank from your rankCalculator if you want dynamic
        // But usually profile has a stored rank/rating.
        // For now let's use a placeholder or derived string based on rating
        const rank = profile?.skill_rating ? `${profile.skill_rating} ELO` : 'Unranked';

        setStats({
          wins,
          losses,
          rank,
          loading: false
        });

      } catch (err) {
        console.error('Error fetching player stats:', err);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
    
    // Subscribe to game_logs changes to auto-update?
    // Maybe overkill for now, but nice to have.
    const channel = supabase
      .channel('public:game_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_logs' }, () => {
          fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

  }, [user]);

  return stats;
}
