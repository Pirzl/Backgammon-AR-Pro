/**
 * Admin Message Center - Refactored for Bidirectional Messaging
 * Shows conversation-based inbox with real-time updates
 */

import React, { useState, useEffect } from 'react';
import { Mail, Search, Send, User } from 'lucide-react';
import { useAdminUnreadCount } from '../../messaging/hooks/useUnreadCounts';
import { useConversation } from '../../messaging/hooks/useConversation';
import {
  sendMessageFromAdminToUsers,
  markMessagesAsReadByAdmin,
  fetchAdminConversationSummaries,
} from '../../../shared/api/messages';
import { supabase } from '../../../shared/api/supabase';
import type { ConversationSummary, UserId } from '../../../shared/types/messages';
import type { ClientData } from '../../../entities/tournament/types';

interface MessageCenterProps {
  clients: ClientData[];
  onRefresh?: () => void;
}

export const MessageCenter: React.FC<MessageCenterProps> = ({ clients }) => {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<UserId | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<UserId | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const { count: unreadCount } = useAdminUnreadCount(adminId || '');
  const { messages: selectedConversation, loading: conversationLoading } = useConversation(
    selectedUserId || '',
    adminId || ''
  );

  // Fetch admin ID on mount
  useEffect(() => {
    async function fetchAdminId() {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (data) {
        setAdminId(data.id);
      }
    }
    fetchAdminId();
  }, []);

  // Load conversations
  useEffect(() => {
    async function loadConversations() {
      setLoadingConversations(true);
      const summaries = await fetchAdminConversationSummaries();
      setConversations(summaries);
      setLoadingConversations(false);
    }

    if (adminId) {
      loadConversations();

      // Subscribe to real-time updates
      const channel = supabase
        .channel('admin-conversations')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
          },
          () => {
            loadConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [adminId]);

  async function handleSelectUser(userId: UserId) {
    setSelectedUserId(userId);
    // Mark messages from this user as read
    await markMessagesAsReadByAdmin(userId);
    // Reload conversations to update unread count
    const summaries = await fetchAdminConversationSummaries();
    setConversations(summaries);
  }

  async function handleSendToSelected() {
    if (!selectedUserId || !messageText.trim() || !adminId || sending) return;

    setSending(true);
    try {
      const { error } = await sendMessageFromAdminToUsers(
        adminId,
        [selectedUserId],
        messageText.trim()
      );

      if (!error) {
        setMessageText('');
      } else {
        alert('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleSendToAll() {
    if (!messageText.trim() || !adminId || sending) return;

    // Confirm broadcast
    const confirmBroadcast = window.confirm(
      `Send this message to all ${clients.length} users?`
    );
    if (!confirmBroadcast) return;

    setSending(true);
    try {
      const userIds = clients.map((c) => c.id);
      const { error } = await sendMessageFromAdminToUsers(
        adminId,
        userIds,
        messageText.trim()
      );

      if (!error) {
        setMessageText('');
        alert(`Message sent to ${userIds.length} users successfully!`);
      } else {
        alert('Failed to send broadcast. Please try again.');
      }
    } catch (error) {
      console.error('Error sending broadcast:', error);
      alert('Failed to send broadcast. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendToSelected();
    }
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter((conv) => {
    const searchLower = search.toLowerCase();
    return (
      conv.userName?.toLowerCase().includes(searchLower) ||
      conv.userEmail?.toLowerCase().includes(searchLower) ||
      conv.userId.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="text-primary" size={20} />
              Support Message Center
              {unreadCount > 0 && (
                <span className="ml-2 bg-rose-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                  {unreadCount} new
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Bidirectional messaging with users
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search conversations..."
              className="pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none w-48 sm:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row h-[600px]">
        
        {/* Conversation List (Left Sidebar) */}
        <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-900/30">
          <div className="p-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Conversations ({filteredConversations.length})
            </h4>

            {loadingConversations && (
              <div className="text-center text-slate-400 py-8">Loading...</div>
            )}

            {!loadingConversations && filteredConversations.length === 0 && (
              <div className="text-center text-slate-400 py-8 text-sm">
                <Mail size={32} className="mx-auto mb-2 opacity-20" />
                No conversations yet
              </div>
            )}

            <div className="space-y-2">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.userId}
                  onClick={() => handleSelectUser(conv.userId)}
                  className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                    selectedUserId === conv.userId
                      ? 'bg-primary/10 border-l-4 border-primary'
                      : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                        <User size={20} className="text-slate-500" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                          {conv.userName || 'Unknown User'}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="flex-shrink-0 ml-2 bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {conv.lastMessage.content}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {conv.lastMessage
                          ? new Date(conv.lastMessage.created_at).toLocaleString()
                          : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Conversation View (Right Panel) */}
        <div className="flex-1 flex flex-col">
          {selectedUserId ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-slate-800">
                {conversationLoading && (
                  <div className="text-center text-slate-400 py-8">Loading messages...</div>
                )}

                {!conversationLoading && selectedConversation.length === 0 && (
                  <div className="text-center text-slate-400 py-8">
                    <Mail size={48} className="mx-auto mb-2 opacity-20" />
                    No messages yet. Start the conversation!
                  </div>
                )}

                {selectedConversation.map((msg) => {
                  const isFromAdmin = msg.sender_id === adminId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isFromAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          isFromAdmin
                            ? 'bg-primary text-white rounded-br-sm'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-bl-sm'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                        <div
                          className={`text-[10px] mt-1 ${
                            isFromAdmin ? 'text-white/70' : 'text-slate-400'
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleString()}
                          {isFromAdmin && msg.read_by_receiver && (
                            <span className="ml-2">✓ Read</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message Composer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                <div className="flex gap-2 mb-2">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    rows={3}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none text-sm"
                    disabled={sending}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Press Enter to send, Shift+Enter for new line
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendToAll}
                      disabled={!messageText.trim() || sending}
                      className="px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
                    >
                      Broadcast to All
                    </button>
                    <button
                      onClick={handleSendToSelected}
                      disabled={!messageText.trim() || sending}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                    >
                      <Send size={16} />
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Mail size={64} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg">Select a conversation to start messaging</p>
                <p className="text-sm mt-2">
                  Choose a user from the list to view and respond to messages
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
