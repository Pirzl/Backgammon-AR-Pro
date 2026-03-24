/**
 * Real-time hooks for unread message counts
 * Uses Supabase Realtime for instant updates
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import {
  getUnreadCountForAdmin,
  getUnreadCountForUser,
} from '../../../shared/api/messages';
import type { UserId } from '../../../shared/types/messages';

/**
 * Hook for admin unread count (messages from users)
 * Subscribes to real-time changes on messages table
 */
export function useAdminUnreadCount(adminId: UserId) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadCount() {
      const c = await getUnreadCountForAdmin();
      if (isMounted) {
        setCount(c);
        setLoading(false);
      }
    }

    loadCount();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('messages-admin-unread')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
        },
        () => {
          // Reload count when any message changes
          loadCount();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [adminId]);

  return { count, loading };
}

/**
 * Hook for user unread count (messages from admin)
 * Subscribes to real-time changes for this specific user
 */
export function useUserUnreadCount(userId: UserId) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadCount() {
      const c = await getUnreadCountForUser(userId);
      if (isMounted) {
        setCount(c);
        setLoading(false);
      }
    }

    loadCount();

    // Subscribe to real-time changes for this user
    const channel = supabase
      .channel(`messages-user-unread-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // Only reload if this message is for this user
          const row = payload.new as { receiver_id?: string };
          if (row.receiver_id === userId) {
            loadCount();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { count, loading };
}
