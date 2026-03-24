import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import type { AdminStats } from '../../../entities/tournament/types';

export const useAdminStats = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_stats_view')
          .select('*')
          .single();

        if (error) throw error;

        // Map snake_case DB fields to camelCase TS interface
        setStats({
          activeUsersCount: 0, // View doesn't have active_users yet, defaulting
          totalUsers: data.total_users,
          totalEntryFeesCollected: data.total_entry_fees_collected,
          totalPrizesDistributed: data.total_prizes_distributed,
          tournamentsCompleted: data.tournaments_completed
        });
      } catch (err: unknown) {
        console.error('Error fetching admin stats:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, loading, error };
};

export const useAIEconomyStats = () => {
  const [stats, setStats] = useState({ totalCirculatingPoints: 0, totalGivenByAI: 0, totalTakenByAI: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase.rpc('get_admin_economy_stats');
      if (!error && data) {
        setStats(data);
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  return { stats, loading };
};
