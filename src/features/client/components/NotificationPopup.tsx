import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Swords } from 'lucide-react';
import type { Message } from '../../../entities/tournament/types';

interface NotificationPopupProps {
  message: Message;
  onDismiss: () => void;
}

export const NotificationPopup: React.FC<NotificationPopupProps> = ({ message, onDismiss }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Only auto-dismiss if it's NOT an invite (invites act as actionable toasts)
    if (message.type !== 'invite') {
        const timer = setTimeout(onDismiss, 5000); 
        return () => clearTimeout(timer);
    }
  }, [onDismiss, message.type]);
  
  const handleAccept = () => {
      // Parse content to get sender info if possible, or just go to game mode
      try {
          const content = typeof message.content === 'string' && message.content.startsWith('{') 
              ? JSON.parse(message.content) 
              : null;
          
          if (content && content.senderId) {
             navigate(`/game?mode=human&opponent=${content.senderId}`);
          } else {
             // Fallback
             navigate('/game?mode=human');
          }
          onDismiss();
      } catch (e) {
          console.error("Error parsing invite:", e);
          navigate('/game?mode=human');
          onDismiss();
      }
  };

  return (
    <div className="fixed top-6 right-6 z-[100] max-w-sm animate-in slide-in-from-right duration-300">
      <div className={`rounded-xl shadow-2xl border p-4 ${message.type === 'invite' ? 'bg-indigo-900 border-indigo-700 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full ${message.type === 'invite' ? 'bg-white/20' : 'bg-primary/10'}`}>
            {message.type === 'invite' ? <Swords size={20} className="text-white" /> : <Mail size={20} className="text-primary" />}
          </div>
          <div className="flex-1">
            <h4 className={`font-bold text-sm ${message.type === 'invite' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
              {message.type === 'legal_notice' ? '⚖️ Aviso Legal' : 
               message.type === 'tournament_alert' ? '🏆 Actualización de Torneo' :
               message.type === 'invite' ? '⚔️ Invitación a Partida' :
               '📧 Nuevo Mensaje'}
            </h4>
            <p className={`text-sm mt-1 line-clamp-2 ${message.type === 'invite' ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-300'}`}>
              {/* If content is JSON, extracting message property would be better, but basic display works too */}
              {(() => {
                  try {
                      const json = JSON.parse(message.content);
                      return json.message || message.content;
                  } catch {
                      return message.content;
                  }
              })()}
            </p>
            
            {message.type === 'invite' && (
                <div className="flex gap-2 mt-3">
                    <button 
                        onClick={handleAccept}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                        ACEPTAR
                    </button>
                    <button 
                        onClick={onDismiss}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                        RECHAZAR
                    </button>
                </div>
            )}
          </div>
          {message.type !== 'invite' && (
              <button 
                onClick={onDismiss} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
              >
                <X size={16} />
              </button>
          )}
        </div>
      </div>
    </div>
  );
};
