import React, { useState, useEffect } from 'react';
import { Search, Filter, Swords, History, Play, XCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../shared/api/supabase';
import { useNavigate } from 'react-router-dom';
import type { ClientData } from '../../../entities/tournament/types';

interface UserPlayerDirectoryProps {
  currentUserId: string;
  clients: ClientData[];
  onInvite: (id: string) => void;
  onViewHistory: (opponentId: string, opponentName: string) => void;
  onlineUserIds: string[];
}

export const UserPlayerDirectory: React.FC<UserPlayerDirectoryProps> = ({ 
    currentUserId, 
    clients, 
    onInvite,
    onViewHistory,
    onlineUserIds 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, { status: string, roomId?: string, isSender: boolean, inviteId: string, updatedAt?: string }>>({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [playerStats, setPlayerStats] = useState<Record<string, { wins: number, losses: number }>>({});
  const navigate = useNavigate();

  const inviteStatusesRef = React.useRef(inviteStatuses);
  useEffect(() => {
     inviteStatusesRef.current = inviteStatuses;
  }, [inviteStatuses]);

  useEffect(() => {
     const timer = setInterval(() => {
         const now = Date.now();
         setCurrentTime(now);

         // Auto-cancel ignored pending invites that are older than 60 seconds
         Object.values(inviteStatusesRef.current).forEach(inviteState => {
             if (inviteState.status === 'pending' && inviteState.isSender && inviteState.inviteId && !inviteState.inviteId.startsWith('temp_')) {
                 const updatedTime = inviteState.updatedAt ? new Date(inviteState.updatedAt).getTime() : 0;
                 if (updatedTime > 0 && (now - updatedTime > 60000)) { // 60 seconds passed
                     // Cancel in Supabase
                     supabase.from('invitations').update({ status: 'cancelled' }).eq('id', inviteState.inviteId).then();
                     
                     // Optimistically update local state to avoid spamming the DB
                     setInviteStatuses(prev => {
                         const newState = { ...prev };
                         Object.keys(newState).forEach(key => {
                             if (newState[key]?.inviteId === inviteState.inviteId) {
                                 newState[key] = { ...newState[key], status: 'cancelled', updatedAt: new Date().toISOString() };
                             }
                         });
                         return newState;
                     });
                 }
             }
         });
     }, 1000);
     return () => clearInterval(timer);
  }, []);

  // Fetch Stats
  useEffect(() => {
    if (!currentUserId) return;
    
    const fetchStats = async () => {
        const { data } = await supabase
            .from('game_logs')
            .select('winner, white_player_id, black_player_id')
            .or(`white_player_id.eq.${currentUserId},black_player_id.eq.${currentUserId}`);
        
        if (data) {
            const stats: Record<string, { wins: number, losses: number }> = {};
            
            data.forEach(game => {
                const isWhite = game.white_player_id === currentUserId;
                const opponentId = isWhite ? game.black_player_id : game.white_player_id;
                
                // Skip if opponent is null (e.g. AI games might not be relevant here if listing humans, but usually they have IDs)
                if (!opponentId) return;

                if (!stats[opponentId]) stats[opponentId] = { wins: 0, losses: 0 };
                
                const userWon = (isWhite && game.winner === 'white') || (!isWhite && game.winner === 'black');
                
                if (userWon) {
                    stats[opponentId].wins++;
                } else {
                    stats[opponentId].losses++;
                }
            });
            setPlayerStats(stats);
        }
    };
    
    fetchStats();
  }, [currentUserId]);

  // Subscribe to invitations (Incoming & Outgoing)
  useEffect(() => {
      if (!currentUserId) return;

      // 1. Fetch initial state
      const fetchActiveInvites = async () => {
          const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          
          const { data } = await supabase
              .from('invitations')
              .select('id, sender_id, receiver_id, status, room_id, created_at, updated_at')
              .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
              .gt('created_at', thirtyMinutesAgo)
              .in('status', ['pending', 'accepted', 'rejected', 'cancelled'])
              .order('created_at', { ascending: false });

          if (data) {
              const statusMap: Record<string, { status: string, roomId?: string, isSender: boolean, inviteId: string, updatedAt?: string }> = {};
              data.forEach((inv: { id: string, sender_id: string; receiver_id: string; status: string; room_id?: string, created_at: string, updated_at?: string }) => {
                  const isSender = inv.sender_id === currentUserId;
                  const otherId = isSender ? inv.receiver_id : inv.sender_id;
                  
                  // Keep most recent
                  if (!statusMap[otherId]) {
                      statusMap[otherId] = { 
                          status: inv.status, 
                          roomId: inv.room_id,
                          isSender,
                          inviteId: inv.id,
                          updatedAt: inv.updated_at || inv.created_at
                      };
                  }
              });
              setInviteStatuses(statusMap);
          }
      };

      fetchActiveInvites();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleRealtimeUpdate = (payload: any) => {
          const newRec = payload.new;
          if (!newRec) return;

          const isSender = newRec.sender_id === currentUserId;
          const otherId = isSender ? newRec.receiver_id : newRec.sender_id;

          setInviteStatuses(prev => ({
              ...prev,
              [otherId]: { 
                  status: newRec.status, 
                  roomId: newRec.room_id,
                  isSender,
                  inviteId: newRec.id,
                  updatedAt: newRec.updated_at || new Date().toISOString()
              }
          }));
      };

      // 2. Realtime Subscription (Listen for ANY change involving me)
      const channel = supabase
          .channel(`directory_invites:${currentUserId}`)
          .on(
              'postgres_changes',
              {
                  event: '*', 
                  schema: 'public',
                  table: 'invitations',
                  filter: `sender_id=eq.${currentUserId}` // Changes to invites I SENT
              },
              handleRealtimeUpdate
          )
          .on(
              'postgres_changes',
              {
                  event: '*', 
                  schema: 'public',
                  table: 'invitations',
                  filter: `receiver_id=eq.${currentUserId}` // Changes to invites I RECEIVED
              },
              handleRealtimeUpdate
          )
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [currentUserId]);

  const handleEnterGame = (roomId: string) => {
      navigate(`/game?room=${roomId}&mode=human`);
  };

  const handleAcceptInvite = async (inviteId: string) => {
      console.log('[Directory] Accepting Invite:', inviteId);
      try {
          // Optimistic Update
          setInviteStatuses(prev => {
              const newState = { ...prev };
              // Find the user associated with this invite and update status
              Object.keys(newState).forEach(key => {
                  const record = newState[key];
                  if (record && record.inviteId === inviteId) {
                      newState[key] = { ...record, status: 'accepted', updatedAt: new Date().toISOString() };
                  }
              });
              return newState;
          });

          const { error } = await supabase
              .from('invitations')
              .update({ status: 'accepted' })
              .eq('id', inviteId);
          
          if (error) throw error;
          console.log('[Directory] Invite Accepted Successfully');
      } catch (err) {
          console.error("Error accepting invite:", err);
          alert("Failed to accept invite");
          // Revert optimistic update (simplified, could be better)
          window.location.reload(); 
      }
  };

  const handleCancelInvite = async (inviteId: string) => {
      console.log('[Directory] Cancelling Invite:', inviteId);
      try {
           // Optimistic Update
           setInviteStatuses(prev => {
               const newState = { ...prev };
               Object.keys(newState).forEach(key => {
                   if (newState[key] && newState[key].inviteId === inviteId) {
                       newState[key] = { ...newState[key], status: 'cancelled', updatedAt: new Date().toISOString() };
                   }
               });
               return newState;
           });

           // Si la invitación todavía no se ha registrado en la base de datos,
           // evitamos enviar un UUID inválido ('temp_...') a Supabase.
           if (inviteId.startsWith('temp_')) {
               console.log('[Directory] Cancelando invitación temporal. No se requiere viaje a la BD.');
               return;
           }

           const { error } = await supabase
               .from('invitations')
               .update({ status: 'cancelled' })
               .eq('id', inviteId);
               
           if (error) throw error;
      } catch (err) {
           console.error("Error cancelling invite:", err);
           alert("Error al cancelar la invitación");
      }
  };

  const handleRejectInvite = async (inviteId: string) => {
      console.log('[Directory] Rejecting Invite:', inviteId);
      try {
           // Optimistic Update
           setInviteStatuses(prev => {
              const newState = { ...prev };
              Object.keys(newState).forEach(key => {
                  const record = newState[key];
                  if (record && record.inviteId === inviteId) {
                      newState[key] = { ...record, status: 'rejected', updatedAt: new Date().toISOString() };
                  }
              });
              return newState;
          });

          const { error } = await supabase
              .from('invitations')
              .update({ status: 'rejected' })
              .eq('id', inviteId);

          if (error) throw error;
      } catch (err) {
          console.error("Error rejecting invite:", err);
      }
  };

  // Filter out current user and apply search/status filters
  const filteredClients = clients.filter(client => {
    if (client.id === currentUserId) return false;

    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      client.firstName.toLowerCase().includes(term) ||
      client.lastName.toLowerCase().includes(term) ||
      client.id.toLowerCase().includes(term);
    
    // Map internal status to simple online/offline for users based on Realtime Presence
    const isActuallyOnline = onlineUserIds.includes(client.id);
    
    // Status is 'online'/'active'/'in-game' AND heartbeat is recent
    const isOnline = isActuallyOnline && (client.status === 'online' || client.status === 'in-game' || client.status === 'active');
    
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'online' && isOnline) ||
                          (filterStatus === 'offline' && !isOnline);
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (client: ClientData) => {
    const isActuallyOnline = onlineUserIds.includes(client.id);
    
    // If detected online by DB heartbeat (or manual status)
    if (isActuallyOnline) {
         // Special case for in-game
         if (client.status === 'in-game') {
             return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
         }
         // Otherwise Force Green
         return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 animate-pulse';
    }

    // Default to offline style
    return 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Directorio de Jugadores</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs">Encuentra oponentes y sigue tu historial</p>
        </div>
        
        <div className="flex w-full sm:w-auto gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar jugadores..." 
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-slate-900 dark:text-white placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="relative">
            <select 
              className="appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white py-2 pl-4 pr-10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'online' | 'offline')}
            >
              <option value="all">Todos los Estados</option>
              <option value="online">En Línea</option>
              <option value="offline">Desconectado</option>
            </select>
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider sticky top-0 z-10">
              <th className="p-4 bg-slate-50 dark:bg-slate-900">Jugador</th>
              <th className="p-4 text-center bg-slate-50 dark:bg-slate-900">Récord</th>
              <th className="p-4 text-center bg-slate-50 dark:bg-slate-900">Estado</th>
              <th className="p-4 text-center bg-slate-50 dark:bg-slate-900">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredClients.map(client => (
              <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                        {client.avatar ? (
                            <img 
                                src={client.avatar} 
                                alt={client.firstName} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('fallback-icon');
                                }}
                            />
                        ) : (
                            <span className="text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        )}
                        {/* Fallback Icon (hidden by default unless img fails or no avatar) */}
                        <div className="hidden fallback-child text-slate-400">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{client.firstName} {client.lastName}</p>
                      {/* Hide full ID for privacy, maybe show only first chunk or alias if available */}
                      <p className="text-xs text-slate-500 dark:text-slate-500">Jugador</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-center">
                   {(() => {
                       const stats = playerStats[client.id] || { wins: 0, losses: 0 };
                       return (
                           <div className="flex flex-col items-center">
                               <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                   V:{stats.wins} - D:{stats.losses}
                               </span>
                           </div>
                       );
                   })()}
                </td>
                <td className="p-4 text-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${getStatusBadge(client)}`}>
                    {(() => {
                        const isActuallyOnline = onlineUserIds.includes(client.id);
                        if (isActuallyOnline) return 'En Línea';
                        return 'Desconectado';
                    })()}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {/* Invite Button - Only active if online */}
                    {/* Invite Button - Dynamic based on status */}
                    {(() => {
                        const inviteState = inviteStatuses[client.id];
                        const status = inviteState?.status;

                        // Debug log for specific user
                        if (client.firstName.includes('tom')) {
                             console.log(`[Directory] Render ${client.firstName} (${client.id}) -> Status: ${status}, Room: ${inviteState?.roomId}`);
                        }

                        if (inviteState && status === 'accepted' && inviteState.roomId) {
                            return (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEnterGame(inviteState.roomId!);
                                    }}
                                    className="p-2 rounded-lg transition-all bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 animate-in zoom-in flex items-center gap-2 px-3"
                                    title="¡Partida Aceptada! Entra Ahora"
                                >
                                    <Play size={18} fill="currentColor" />
                                    <span className="text-xs font-bold">JUGAR</span>
                                </button>
                            );
                        }

                        if (inviteState && status === 'pending') {
                            if (inviteState.isSender) {
                                // I sent it, waiting for them
                                return (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (inviteState.inviteId) {
                                                    handleCancelInvite(inviteState.inviteId);
                                                }
                                            }}
                                            className="p-2 rounded-lg transition-all text-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40"
                                            title="Cancelar invitación"
                                        >
                                            <span className="flex items-center gap-1 text-xs font-bold uppercase">
                                                <XCircle size={14} /> Cancelar
                                            </span>
                                        </button>
                                    </div>
                                );
                            } else {
                                // I received it, I need to accept/reject
                                return (
                                    <div className="flex items-center gap-2 animate-in fade-in">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (inviteState.inviteId) {
                                                    handleAcceptInvite(inviteState.inviteId);
                                                }
                                            }}
                                            className="p-2 rounded-lg transition-all bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                                            title="Aceptar Invitación"
                                        >
                                            <CheckCircle2 size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (inviteState.inviteId) {
                                                    handleRejectInvite(inviteState.inviteId);
                                                }
                                            }}
                                            className="p-2.5 rounded-lg transition-all bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-rose-900/10 dark:text-rose-400 dark:hover:bg-rose-900/30"
                                            title="Rechazar"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                );
                            }
                        }

                        if (inviteState && (status === 'rejected' || status === 'cancelled')) {
                             const updatedTime = inviteState.updatedAt ? new Date(inviteState.updatedAt).getTime() : 0;
                             const timePassed = currentTime - updatedTime;
                             const cooldownDuration = 5 * 60 * 1000; // 5 minutes
                             
                             if (timePassed < cooldownDuration) {
                                 const remainingSeconds = Math.ceil((cooldownDuration - timePassed) / 1000);
                                 const minutes = Math.floor(remainingSeconds / 60);
                                 const seconds = remainingSeconds % 60;
                                 const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                 const isRejected = status === 'rejected';
                                 
                                 return (
                                     <button
                                         disabled
                                         className={`p-2 rounded-lg flex items-center gap-2 transition-all cursor-not-allowed ${isRejected ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'}`}
                                         title={isRejected ? "Invitación Rechazada" : "Invitación Cancelada"}
                                     >
                                         <XCircle size={18} />
                                         <span className="text-xs font-bold font-mono">{timeStr}</span>
                                     </button>
                                 );
                             }
                             // Si pasaron los 5 minutos, el if anterior no se cumple y
                             // el código continúa libremente para mostrar el botón de Invitar 'Default' que está debajo.
                        }

                        // Default: Invite Button
                        const isOnlineForInvite = onlineUserIds.includes(client.id);

                        return (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Optimistically set pending
                                    setInviteStatuses(prev => ({
                                        ...prev,
                                        [client.id]: { 
                                            status: 'pending',
                                            isSender: true,
                                            inviteId: 'temp_' + Date.now(),
                                            updatedAt: new Date().toISOString()
                                        }
                                    }));
                                    onInvite(client.id);
                                }}
                                disabled={!isOnlineForInvite}
                                className={`p-2 rounded-lg transition-all ${
                                    isOnlineForInvite
                                    ? 'text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 cursor-pointer' 
                                    : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                }`}
                                title={isOnlineForInvite ? "Invitar a Partida" : "Jugador Desconectado"}
                            >
                                <Swords size={18} />
                            </button>
                        );
                    })()}

                    <button 
                        onClick={() => onViewHistory(client.id, client.firstName)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/20 rounded-lg transition-all"
                        title="Ver Historial contra Jugador"
                    >
                        <History size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {filteredClients.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-lg">No se encontraron jugadores.</p>
        </div>
      )}
    </div>
  );
};
