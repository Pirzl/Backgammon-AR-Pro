import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { isRecentlyActive } from '../../../shared/lib/presence';

export interface PlayerActivity {
  id: string;
  username: string;
  isOnline: boolean;
  lastSeen: string;
  currentGame: string | null;
  role: string | null;
}

export function useRealtimeActivity() {
  const [players, setPlayers] = useState<PlayerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchActivePlayers();

    // Subscribe to profile changes (realtime)
    const channel = supabase
      .channel('player-activity')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          // Refresh player list when any profile changes
          fetchActivePlayers();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchActivePlayers() {
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, username, status, last_seen, role')
        .order('last_seen', { ascending: false });

      if (fetchError) throw fetchError;

      if (data) {
        const now = new Date().getTime();

        setPlayers(
          data.map(p => ({
            id: p.id,
            username: p.username || 'Anonymous',
            // Online = heartbeat recency ONLY. The `status` column is sticky
            // (never reset offline on mobile/crash) → ignoring it here prevents
            // permanent false "online" states.
            isOnline: isRecentlyActive(p.last_seen, now),
            lastSeen: p.last_seen || new Date().toISOString(),
            currentGame: null, // TODO: Implement active games tracking
            role: p.role
          }))
        );
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching active players:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch players');
    } finally {
      setLoading(false);
    }
  }

  const onlineCount = players.filter(p => p.isOnline).length;
  const registeredCount = players.length;

  return { 
    players, 
    loading, 
    error,
    onlineCount,
    registeredCount,
    refresh: fetchActivePlayers 
  };
}
