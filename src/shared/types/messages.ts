/**
 * TypeScript Type Definitions for CRM Messaging System
 * Bidirectional messaging between Admin and Users
 */

export type UserId = string;

/**
 * Message interface matching the database schema
 */
export interface Message {
  id: string;
  sender_id: UserId;
  receiver_id: UserId;
  content: string;
  created_at: string;
  read_by_receiver: boolean;
  read_by_admin: boolean;
  is_admin_message: boolean;
  is_broadcast: boolean;
}

/**
 * Unread message counts for admin and user views
 */
export interface UnreadCounts {
  forAdmin: number;      // unread user → admin messages
  forUser: number;       // unread admin → user messages
}

/**
 * Conversation summary for admin inbox view
 * Shows last message and unread count per user
 */
export interface ConversationSummary {
  userId: UserId;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  lastMessage: Message | null;
  unreadCount: number;
}

/**
 * Message send request payload
 */
export interface SendMessagePayload {
  receiverId: UserId;
  content: string;
  isAdminMessage?: boolean;
  isBroadcast?: boolean;
}
