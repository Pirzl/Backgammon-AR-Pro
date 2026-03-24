/**
 * Supabase Client Singleton
 * Configured with BigInt-safe handling for Zobrist hashes
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'backgammon-vivo/1.0'
    }
  }
});

// Expose to window for debugging (dev only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // Type-safe window extension for dev debugging
  const globalWindow = window as Window & { supabase?: typeof supabase };
  globalWindow.supabase = supabase;
}

/**
 * Check if the current user has admin role
 * @returns true if user is authenticated and has admin role
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    return profile?.role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Update user's online status
 * Call this when user becomes active/inactive
 */
export async function updateUserStatus(status: 'online' | 'offline'): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Use RPC for presence to handle potential DB logic and efficiency
    if (status === 'online') {
      await supabase.rpc('update_user_presence', { p_user_id: user.id });
    } else {
      // For offline, we still do a manual update or just rely on heartbeats stopping.
      // Keeping manual update for explicit logout/tab close.
      await supabase
        .from('profiles')
        .update({ 
          status: 'offline',
          last_seen: new Date().toISOString()
        })
        .eq('id', user.id);
    }
  } catch (error) {
    console.error('Error updating user status:', error);
  }
}

// ─── Presence Heartbeat System ───────────────────────────────
// Sends periodic 'online' updates to keep last_seen fresh.
// Clients derive online/offline: is_online = (now - last_seen) <= 45s

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start sending periodic presence heartbeats (every 20s).
 * Safe to call multiple times — only one interval runs at a time.
 */
export function startPresenceHeartbeat(): void {
  if (_heartbeatInterval) return; // Already running
  
  // Immediately mark as online
  updateUserStatus('online');
  
  _heartbeatInterval = setInterval(() => {
    updateUserStatus('online');
  }, 20_000); // Every 20 seconds
}

/**
 * Stop the presence heartbeat and mark user as offline.
 */
export function stopPresenceHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
  updateUserStatus('offline');
}

/**
 * Subscribe to realtime presence changes
 * Returns an unsubscribe function
 */
interface PresenceState {
  user_id: string;
  online_at: string;
  [key: string]: unknown;
}

export const subscribeToPresence = (userId: string, onPresenceChange: (onlineUserIds: string[]) => void) => {
    const channel = supabase.channel('online-users');

    channel
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            const onlineIds: string[] = [];
            
            // Iterate over all presence entries to find user_ids
            Object.values(newState).forEach((presences) => {
                (presences as unknown as PresenceState[]).forEach((presence) => {
                   if (presence.user_id) {
                       onlineIds.push(presence.user_id);
                   }
                });
            });
            
            // Deduplicate
            const uniqueIds = [...new Set(onlineIds)];
            // console.log('Online Users Sync:', uniqueIds);
            onPresenceChange(uniqueIds);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: userId,
                    online_at: new Date().toISOString(),
                });
            }
        });

    return () => {
        supabase.removeChannel(channel);
    };
};
