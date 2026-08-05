/**
 * CRMProvider — centralized presence + invitation state for VIVO.
 *
 * Single source of truth for:
 * - onlineUserIds
 * - invitations
 * - sendInvite / acceptInvite / rejectInvite
 */
import { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { supabase } from '../../shared/api/supabase';
import { useAuth } from '../../features/auth/useAuth';
import { presenceManager } from '../../shared/lib/PresenceManager';

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface Invitation {
  id: string;
  sender_id: string;
  receiver_id: string;
  room_id: string;
  status: InvitationStatus;
  created_at: string;
  updated_at: string;
  sender?: { username: string; avatar_url: string } | null;
}

export interface CRMContextValue {
  onlineUserIds: string[];
  invitations: Invitation[];
  sendInvite: (recipientId: string) => Promise<string | undefined>;
  acceptInvite: (invite: Invitation) => Promise<void>;
  rejectInvite: (inviteId: string) => Promise<void>;
}

const CRMContext = createContext<CRMContextValue | null>(null);

export const CRMProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  // Subscribe once to PresenceManager
  useEffect(() => {
    if (!user?.id) return;
    const unsub = presenceManager.subscribe((ids) => setOnlineUserIds(ids));
    return unsub;
  }, [user?.id]);

  // Single invitations subscription
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const fetchInvitations = async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('invitations')
        .select(`
          id,
          sender_id,
          receiver_id,
          room_id,
          status,
          created_at,
          updated_at,
          sender:sender_id (username, avatar_url)
        `)
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .gt('created_at', thirtyMinutesAgo)
        .in('status', ['pending', 'accepted', 'rejected', 'cancelled'])
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error('[CRMProvider] Error fetching invitations:', error);
        return;
      }

      const normalized = (data || []).map((item: any) => ({
        ...item,
        sender: Array.isArray(item.sender) ? item.sender[0] : item.sender,
      }));

      setInvitations(normalized as Invitation[]);
    };

    fetchInvitations();

    const channel = supabase
      .channel(`crm-invitations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*' as const,
          schema: 'public',
          table: 'invitations',
          filter: `sender_id=eq.${user.id}`,
        },
        () => fetchInvitations()
      )
      .on(
        'postgres_changes',
        {
          event: '*' as const,
          schema: 'public',
          table: 'invitations',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => fetchInvitations()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const sendInvite = async (recipientId: string): Promise<string | undefined> => {
    if (!user?.id) return undefined;

    const existing = invitations.find(
      (i) =>
        ((i.sender_id === user.id && i.receiver_id === recipientId) ||
          (i.sender_id === recipientId && i.receiver_id === user.id)) &&
        ['accepted', 'pending'].includes(i.status)
    );

    if (existing) {
      if (existing.status === 'accepted' || existing.status === 'pending') {
        return existing.room_id;
      }
    }

    const roomId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        sender_id: user.id,
        receiver_id: recipientId,
        room_id: roomId,
        status: 'pending',
      })
      .select('room_id')
      .single();

    if (error) throw error;

    return data?.room_id;
  };

  const acceptInvite = async (invite: Invitation) => {
    if (!user?.id) return;

    const { error: inviteError } = await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    if (inviteError) throw inviteError;

    const { error: matchError } = await supabase
      .from('matches')
      .insert({
        room_id: invite.room_id,
        player_white: invite.sender_id,
        player_black: user.id,
        status: 'waiting',
        cube_value: 1,
        cube_owner: null,
      });

    if (matchError) {
      console.error('[CRMProvider] Error creating match:', matchError);
    }
  };

  const rejectInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from('invitations')
      .update({ status: 'rejected' })
      .eq('id', inviteId);

    if (error) throw error;
  };

  const value = useMemo<CRMContextValue>(
    () => ({
      onlineUserIds,
      invitations,
      sendInvite,
      acceptInvite,
      rejectInvite,
    }),
    [onlineUserIds, invitations, sendInvite, acceptInvite, rejectInvite]
  );

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
};

export const useCRM = (): CRMContextValue => {
  const ctx = useContext(CRMContext);
  if (!ctx) {
    throw new Error('useCRM must be used within <CRMProvider>');
  }
  return ctx;
};
