import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { fetchConversation } from '../../../shared/api/messages';
import type { Message, UserId } from '../../../shared/types/messages';

export function useConversation(userId: UserId | null, viewerId: UserId | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Effect A: clear state when IDs are missing — schedule updates asynchronously
  useEffect(() => {
    if (!userId || !viewerId) {
      // schedule the clear on next tick to avoid synchronous setState in effect
      const t = window.setTimeout(() => {
        setMessages([]);
        setLoading(false);
      }, 0);

      return () => {
        clearTimeout(t);
      };
    }
    // no cleanup needed when IDs are present
    return;
  }, [userId, viewerId]);

  // Effect B: fetch + subscribe, only when both IDs exist
  useEffect(() => {
    if (!userId || !viewerId) return; // guard ensures non-null below

    let isMounted = true;

    async function loadConversation() {
      try {
        // indicate loading when the fetch actually starts
        if (isMounted) setLoading(true);

        // safe to assert non-null because of the guard
        const data = await fetchConversation(userId!, viewerId!);

        if (isMounted) {
          setMessages(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading conversation:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadConversation();

    const channel = supabase
      .channel(`conversation-${userId}-${viewerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Message;
          const isRelevant =
            (row.sender_id === userId && row.receiver_id === viewerId) ||
            (row.sender_id === viewerId && row.receiver_id === userId);
          if (isRelevant) {
            loadConversation();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId, viewerId]);

  return { messages, loading };
}
