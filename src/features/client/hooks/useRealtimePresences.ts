import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { isRecentlyActive } from '../../../shared/lib/presence';

// Hook to get online users based on Database 'last_seen' (heartbeat recency)
// Matches the logic used in Admin Dashboard (useRealtimeActivity)
export function useRealtimePresences() {
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchPresences = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, status, last_seen');

        if (error) {
            console.error('Error fetching presences:', error);
            return;
        }

        if (data && isMounted) {
            const now = Date.now();
            // Online = heartbeat recency ONLY (60s). The `status` column is
            // sticky (never auto-reset offline on mobile/crash) → ignoring it
            // here prevents permanent false "online" states.
            const ids = data.filter(p => isRecentlyActive(p.last_seen, now)).map(p => p.id);
            setOnlineUserIds(ids);
        }
    };

    // Initial Fetch
    fetchPresences();

    // Subscribe to DB changes
    const channel = supabase
      .channel('public:profiles_presence_client')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchPresences();
      })
      .subscribe();

    // Polling fallback (every 30s) just in case events are missed
    const interval = setInterval(fetchPresences, 30000);

    return () => {
        isMounted = false;
        clearInterval(interval);
        supabase.removeChannel(channel);
    };
  }, []);

  return onlineUserIds;
}
