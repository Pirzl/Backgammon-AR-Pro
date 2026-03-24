/**
 * User Messaging Panel Component
 * Allows users to view and send messages to admin
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { useUserUnreadCount } from '../hooks/useUnreadCounts';
import { useConversation } from '../hooks/useConversation';
import {
  sendMessageFromUserToAdmin,
  markMessagesAsReadByUser,
} from '../../../shared/api/messages';
import type { UserId } from '../../../shared/types/messages';

interface UserMessagingPanelProps {
  userId: UserId;
}

export const UserMessagingPanel: React.FC<UserMessagingPanelProps> = ({
  userId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<UserId | null>(null);

  const { count: unreadCount } = useUserUnreadCount(userId);
  const { messages, loading } = useConversation(adminId || userId, userId);

  // Fetch admin ID on mount
  useEffect(() => {
    async function fetchAdminId() {
      const { supabase } = await import('../../../shared/api/supabase');
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

  // Admin uses the MessageCenter, not this panel — prevent self-messaging
  if (adminId && adminId === userId) return null;

  async function handleOpenConversation() {
    setIsOpen(true);
    // Mark messages as read when opening
    await markMessagesAsReadByUser(userId);
  }

  async function handleSend() {
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      const { error } = await sendMessageFromUserToAdmin(userId, messageText.trim());
      if (!error) {
        setMessageText('');
      } else {
        alert('Error al enviar el mensaje. Inténtalo de nuevo.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error al enviar el mensaje. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={handleOpenConversation}
        className="fixed bottom-6 right-6 z-50 bg-primary text-white rounded-full p-4 shadow-lg hover:bg-primary/90 transition-all duration-300 cursor-pointer flex items-center gap-2"
        title="Mensajes"
      >
        <MessageCircle size={24} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs w-6 h-6 flex items-center justify-center rounded-full border-2 border-white font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Message Panel Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl sm:max-h-[600px] shadow-2xl flex flex-col h-[90vh] sm:h-auto animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in duration-300">
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex justify-between items-center rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageCircle className="text-primary" size={20} />
                  Mensajes con Soporte
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Chatea con nuestro equipo de soporte
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50 dark:bg-slate-900/30">
              {loading && (
                <div className="text-center text-slate-400 py-8">Cargando mensajes...</div>
              )}

              {!loading && messages.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                  <MessageCircle size={48} className="mx-auto mb-2 opacity-20" />
                  <p>Aún no hay mensajes. ¡Inicia una conversación con soporte!</p>
                </div>
              )}

              {messages.map((msg) => {
                const isFromUser = msg.sender_id === userId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isFromUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                        isFromUser
                          ? 'bg-primary text-white rounded-br-sm'
                          : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600 rounded-bl-sm'
                      }`}
                    >
                      <div className="text-sm sm:text-base whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                      <div
                        className={`text-[10px] mt-1 ${
                          isFromUser ? 'text-white/70' : 'text-slate-400'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleString()}
                        {isFromUser && msg.read_by_receiver && (
                          <span className="ml-2">{'\u2713'} Le{'\u00ed'}do</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Composer */}
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  rows={2}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none text-sm"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  <Send size={18} />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Pulsa Enter para enviar, Shift+Enter para nueva l{'\u00ed'}nea
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
