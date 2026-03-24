import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GamePayload, MoveData } from '../types/gamestate';

export interface PresenceState {
  userId: string;
  onlineAt: number;
}

export function useSupabaseRealtime(
  roomId: string, 
  userId: string, 
  onGameUpdate?: (payload: GamePayload) => void
) {
  const [presence, setPresence] = useState<PresenceState[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // 1. Stable Callback Ref (Fixes Stale Closures)
  const onGameUpdateRef = useRef(onGameUpdate);

  useEffect(() => {
    onGameUpdateRef.current = onGameUpdate;
  }, [onGameUpdate]);

  useEffect(() => {
    if (!roomId || !userId) return;

    // 2. Create Channel
    const channelSubscription = supabase.channel(`room:${roomId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    // 3. Attach Listeners
    channelSubscription
      .on('presence', { event: 'sync' }, () => {
        const newState = channelSubscription.presenceState();
        const users = Object.values(newState).flat() as unknown as PresenceState[];
        setPresence(users);
      })
      .on('broadcast', { event: 'game-update' }, (response: { payload: GamePayload }) => {
        // Safe execution of latest callback
        if (onGameUpdateRef.current) {
          onGameUpdateRef.current(response.payload);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
           setChannel(channelSubscription);
           await channelSubscription.track({ 
             userId, 
             onlineAt: Date.now() 
           });
        }
      });

    channelRef.current = channelSubscription;

    // 4. Cleanup
    return () => {
      // Clean cleanup
      channelSubscription.unsubscribe();
      setChannel(null);
      channelRef.current = null;
    };
  }, [roomId, userId]); // Dependencies are now truly minimal

  const broadcastMove = useCallback(async (move: MoveData) => {
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'game-update',
        payload: { 
          move, 
          from: userId,
          timestamp: Date.now()
        } as GamePayload,
      });
    }
  }, [userId]);

  return { 
    presence, 
    broadcastMove,
    channel 
  } as const;
}
