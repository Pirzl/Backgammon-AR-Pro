import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';

// Hook to get online users based on Database 'last_seen' 
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
            // Threshold matches Admin: 5 minutes
            // Heartbeat updates every 20s, so this is very safe.
            const ONLINE_THRESHOLD = 5 * 60 * 1000; 

            const ids = data.filter(p => {
                const isStatusOnline = p.status === 'online';
                const lastSeenTime = p.last_seen ? new Date(p.last_seen).getTime() : 0;
                const isRecent = (now - lastSeenTime) < ONLINE_THRESHOLD; 
                return isStatusOnline || isRecent;
            }).map(p => p.id);
            
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
