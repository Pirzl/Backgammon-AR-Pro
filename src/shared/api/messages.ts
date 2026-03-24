/**
 * CRM Messaging API Layer
 * Functions for bidirectional Admin <-> User messaging with Supabase
 */

import { supabase } from './supabase';
import type { Message, UserId, ConversationSummary } from '../types/messages';

/**
 * Send a message from user to admin
 * @param userId - The user's ID (sender)
 * @param content - Message content
 */
export async function sendMessageFromUserToAdmin(
  userId: UserId,
  content: string
): Promise<{ data: Message | null; error: Error | null }> {
  try {
    // Get the first admin user
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (adminError || !adminProfile) {
      throw new Error('Admin user not found');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: userId,
        receiver_id: adminProfile.id,
        content: content.trim(),
        is_admin_message: false,
        is_broadcast: false,
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error sending message to admin:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Send message(s) from admin to user(s)
 * @param adminId - The admin's ID (sender)
 * @param receiverIds - Array of user IDs to send to
 * @param content - Message content
 */
export async function sendMessageFromAdminToUsers(
  adminId: UserId,
  receiverIds: UserId[],
  content: string
): Promise<{ data: Message[] | null; error: Error | null }> {
  try {
    const messages = receiverIds.map((receiverId) => ({
      sender_id: adminId,
      receiver_id: receiverId,
      content: content.trim(),
      is_admin_message: true,
      is_broadcast: receiverIds.length > 1,
    }));

    const { data, error } = await supabase
      .from('messages')
      .insert(messages)
      .select();

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error sending admin message:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Fetch conversation between two users
 * @param userId - First user ID
 * @param viewerId - Second user ID (the viewer)
 */
export async function fetchConversation(
  userId: UserId,
  viewerId: UserId
): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${viewerId}),and(sender_id.eq.${viewerId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as Message[];
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return [];
  }
}

/**
 * Mark messages as read by admin
 * @param userId - The user whose messages to mark as read
 */
export async function markMessagesAsReadByAdmin(userId: UserId): Promise<void> {
  try {
    // Get admin ID
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminProfile) return;

    const { error } = await supabase
      .from('messages')
      .update({ read_by_admin: true })
      .eq('receiver_id', adminProfile.id)
      .eq('sender_id', userId)
      .eq('read_by_admin', false);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking messages as read by admin:', error);
  }
}

/**
 * Mark messages as read by user
 * @param userId - The user ID
 */
export async function markMessagesAsReadByUser(userId: UserId): Promise<void> {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ read_by_receiver: true })
      .eq('receiver_id', userId)
      .eq('read_by_receiver', false);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking messages as read by user:', error);
  }
}

/**
 * Get unread message count for admin (messages from users)
 */
export async function getUnreadCountForAdmin(): Promise<number> {
  try {
    // Get admin ID
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminProfile) return 0;

    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', adminProfile.id)
      .eq('read_by_admin', false);

    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.error('Error getting unread count for admin:', error);
    return 0;
  }
}

/**
 * Get unread message count for user (messages from admin)
 * @param userId - The user ID
 */
export async function getUnreadCountForUser(userId: UserId): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('read_by_receiver', false);

    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.error('Error getting unread count for user:', error);
    return 0;
  }
}

/**
 * Fetch conversation summaries for admin (all user conversations)
 * Returns list of users with their last message and unread count
 */
export async function fetchAdminConversationSummaries(): Promise<ConversationSummary[]> {
  try {
    // Get admin ID
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminProfile) return [];

    // Fetch all messages where admin is involved
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${adminProfile.id},receiver_id.eq.${adminProfile.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by user
    const conversationMap = new Map<UserId, ConversationSummary>();

    for (const msg of messages as Message[]) {
      // Determine the other user (not admin)
      const otherUserId = msg.sender_id === adminProfile.id 
        ? msg.receiver_id 
        : msg.sender_id;

      if (!conversationMap.has(otherUserId)) {
        // Fetch user profile for name/email
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('username, email')
          .eq('id', otherUserId)
          .single();

        conversationMap.set(otherUserId, {
          userId: otherUserId,
          userName: userProfile?.username || 'Unknown User',
          userEmail: userProfile?.email,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      // Count unread messages from this user to admin
      const summary = conversationMap.get(otherUserId)!;
      if (msg.sender_id === otherUserId && !msg.read_by_admin) {
        summary.unreadCount += 1;
      }
    }

    return Array.from(conversationMap.values());
  } catch (error) {
    console.error('Error fetching admin conversation summaries:', error);
    return [];
  }
}
