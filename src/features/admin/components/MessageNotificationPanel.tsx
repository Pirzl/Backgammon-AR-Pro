import React, { useEffect, useState } from 'react';
import { MessageSquare, Clock, AlertCircle } from 'lucide-react';
import { fetchAdminConversationSummaries } from '../../../shared/api/messages';
import type { ConversationSummary } from '../../../shared/types/messages';

interface MessageNotificationPanelProps {
  onViewMessages: () => void;
}

export const MessageNotificationPanel: React.FC<MessageNotificationPanelProps> = ({ onViewMessages }) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const summaries = await fetchAdminConversationSummaries();
      // Filter only conversations with unread messages, limit to 3 most recent
      const unreadConversations = summaries
        .filter((conv: ConversationSummary) => conv.unreadCount > 0)
        .slice(0, 3);
      setConversations(unreadConversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (conversations.length === 0) {
    return null; // No unread messages, don't display panel
  }

  // Calculate time ago
  const timeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - past.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/20 dark:to-orange-950/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-100 dark:bg-rose-900/50 rounded-lg">
            <AlertCircle size={18} className="text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="font-bold text-sm text-rose-900 dark:text-rose-100">
            New Messages from Users
          </h3>
        </div>
        <button
          onClick={onViewMessages}
          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors underline"
        >
          View All
        </button>
      </div>

      <div className="space-y-2">
        {conversations.map((conv) => (
          <button
            key={conv.userId}
            onClick={onViewMessages}
            className="w-full text-left p-3 bg-white dark:bg-slate-800/50 border border-rose-100 dark:border-rose-900/50 rounded-lg hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700 transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                    {conv.userName || 'User'}
                  </span>
                  {conv.unreadCount > 1 && (
                    <span className="ml-auto px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                  {conv.lastMessage?.content || 'No preview'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <Clock size={10} />
                  <span>{conv.lastMessage ? timeAgo(conv.lastMessage.created_at) : ''}</span>
                </div>
                {/* Urgency indicator - if message is less than 30 minutes old */}
                {conv.lastMessage && new Date().getTime() - new Date(conv.lastMessage.created_at).getTime() < 1800000 && (
                  <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 animate-pulse">
                    URGENT
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-3 text-center">
        💡 Messages marked "URGENT" are less than 30 minutes old
      </p>
    </div>
  );
};
