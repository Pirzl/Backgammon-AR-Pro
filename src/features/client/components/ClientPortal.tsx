
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, Mail, Trophy, CreditCard,
  Layout, Settings, User, Lock, Trash2, Info, Wallet, AlertTriangle, CheckCircle2, ArrowLeft, X, ShieldCheck, UserPlus, Clock, Gamepad2, Menu, FileText, ShieldAlert, Users
} from 'lucide-react';
import type { ClientData, Tournament, Message, GameLog, Transaction } from '../../../entities/tournament/types'; 
import { NotificationPopup } from './NotificationPopup';
import { RankBadge } from '../../ranking/components/RankBadge';
import { calculateNewRank } from '../../ranking/rankCalculator';
import { CalibrationStatusPanel } from '../../hand-tracking/ui/CalibrationStatusPanel';
import { MatchSummaryDashboard } from './MatchSummaryDashboard';
import { UserPlayerDirectory } from './UserPlayerDirectory';
import { PlayerHistoryView } from './PlayerHistoryView';
import { useRealtimePresences } from '../hooks/useRealtimePresences';
import { startPresenceHeartbeat, stopPresenceHeartbeat, supabase } from '../../../shared/api/supabase';
import { useWallet } from '../../game-board/lib/useWallet';
import { KingOfTheHill } from './KingOfTheHill';

// ... imports ...

type ClientTab = 'history' | 'lobby' | 'my_tournaments' | 'wallet' | 'messages' | 'settings' | 'rules' | 'terms' | 'privacy';

interface ClientPortalProps {
  client: ClientData;
  activeGameHistory: GameLog[];
  activeTournaments: Tournament[];
  allClients: ClientData[];
  tournamentRules: string;
  onLogout: () => void;
  onJoinTournament: (clientId: string, tournamentId: string) => void;
  onLeaveTournament?: (tournamentId: string) => Promise<void>;
  sendGameInvite?: (recipientId: string, recipientName: string) => Promise<boolean>;
  onUpdateNotes: (clientId: string, note: string) => void;
  currentTheme: 'light' | 'dark' | 'system';
  onUpdateTheme: (theme: 'light' | 'dark' | 'system') => void;
  onUpdateProfile: (id: string, f: string, l: string) => void;
  onDeleteAccount: (id: string) => void;
  onPasswordChange: (newPassword: string) => Promise<boolean>;
  initialTab?: string;
}

// Inside ClientPortal component
export const ClientPortal: React.FC<ClientPortalProps> = ({ 
  // ... props
  client,
  activeGameHistory = [],
  activeTournaments = [],
  allClients = [],
  tournamentRules,
  onLogout,
  onJoinTournament,
  onLeaveTournament,
  sendGameInvite,
  onUpdateNotes,
  currentTheme,
  onUpdateTheme,
  onUpdateProfile,
  onDeleteAccount,
  onPasswordChange,
  initialTab
}) => {
  // Suppress unused prop warning
  void onUpdateNotes;
  const navigate = useNavigate();
  
  // Use DB-based Presence (Matches Admin Logic)
  const onlineUserIds = useRealtimePresences();

  // Heartbeat (Keep alive)
  useEffect(() => {
    if (!client?.id) return;
    
    // Start Heartbeat (updates DB for legacy/admin view & our new hook)
    startPresenceHeartbeat();

    return () => {
        stopPresenceHeartbeat();
    };
  }, [client?.id]);


  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ClientTab>((initialTab as ClientTab) || 'history');
  const { saldo_actual: points } = useWallet();
  
  const [directoryView, setDirectoryView] = useState<'list' | 'history'>('list');
  const [selectedOpponent, setSelectedOpponent] = useState<{id: string, name: string} | null>(null);
  
  const [showNotification, setShowNotification] = useState(false);
  const [notificationQueue, setNotificationQueue] = useState<Message[]>([]);
  
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [currentInviteTournamentId, setCurrentInviteTournamentId] = useState<string | null>(null);

  void currentInviteTournamentId;

  const [joinModalTournament, setJoinModalTournament] = useState<Tournament | null>(null);
  const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);

  // --- Real Transactions Logic ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Forms & Status
  const [profileForm, setProfileForm] = useState({ firstName: client?.firstName || '', lastName: client?.lastName || '' });
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  // Preference states
  const [aiTauntsEnabled, setAiTauntsEnabled] = useState(() => {
    const saved = localStorage.getItem('vivo_ai_taunts_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [geminiTauntsEnabled, setGeminiTauntsEnabled] = useState(() => {
    const saved = localStorage.getItem('vivo_gemini_taunts_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [trainingModeEnabled, setTrainingModeEnabled] = useState(() => {
    const saved = localStorage.getItem('vivo_training_mode_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  // Effects
  // Save AI taunts preference to localStorage
  useEffect(() => {
    localStorage.setItem('vivo_ai_taunts_enabled', aiTauntsEnabled.toString());
  }, [aiTauntsEnabled]);

  // Save Gemini taunts preference to localStorage
  useEffect(() => {
    localStorage.setItem('vivo_gemini_taunts_enabled', geminiTauntsEnabled.toString());
  }, [geminiTauntsEnabled]);

  // Save Training Mode preference to localStorage & Database
  useEffect(() => {
    localStorage.setItem('vivo_training_mode_enabled', trainingModeEnabled.toString());
    
    // Attempt to save to database if client ID is available
    if (client?.id) {
      import('../../../shared/api/supabase').then(({ supabase }) => {
        supabase
          .from('profiles')
          .update({ training_mode_enabled: trainingModeEnabled })
          .eq('id', client.id)
          .then(({ error }) => {
            if (error) console.error('Failed to update training mode in DB:', error);
          });
      });
    }
  }, [trainingModeEnabled, client?.id]);

  useEffect(() => {
    if (activeTab === 'wallet' && client?.id) {
      const fetchTransactions = async () => {
        setLoadingTransactions(true);
        try {
          const { supabase } = await import('../../../shared/api/supabase');
          const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', client.id)
            .order('timestamp', { ascending: false })
            .limit(15);
          
          if (error) throw error;
          setTransactions(data || []);
        } catch (err) {
          console.error('Error fetching transactions:', err);
        } finally {
          setLoadingTransactions(false);
        }
      };
      fetchTransactions();
    }
  }, [activeTab, client?.id]);

  // Realtime Notifications Subscription
  useEffect(() => {
    if (!client?.id) return;

    const setupNotifications = async () => {
      const { supabase } = await import('../../../shared/api/supabase');
      const channel = supabase
        .channel(`user_notifications:${client.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `client_id=eq.${client.id}`
          },
          (payload) => {
            console.log('New notification received:', payload.new);
            const newMsg = payload.new as Message;
            setNotificationQueue(prev => [...prev, newMsg]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    setupNotifications();
  }, [client?.id]);

  // Messages Scroll behavior
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');
  
  // Effects
  // Track previous client data to update form only when server data changes
  const [prevClient, setPrevClient] = useState({ firstName: client?.firstName, lastName: client?.lastName });

  // Effects
  // Derived state: Sync profile form when client data changes (server update)
  if (client && (client.firstName !== prevClient.firstName || client.lastName !== prevClient.lastName)) {
     setPrevClient({ firstName: client.firstName, lastName: client.lastName });
     setProfileForm({ firstName: client.firstName, lastName: client.lastName });
  }

  const handleMobileNav = (tab: ClientTab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const handleUpdateProfileSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateProfile(client.id, profileForm.firstName, profileForm.lastName);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordForm.new !== passwordForm.confirm) {
          setPasswordStatus('error');
          setPasswordMessage("Passwords don't match");
          return;
      }
      if (passwordForm.new.length < 6) {
          setPasswordStatus('error');
          setPasswordMessage("La contraseña debe tener al menos 6 caracteres");
          return;
      }
      setPasswordStatus('idle'); 
      const success = await onPasswordChange(passwordForm.new);
      if (success) {
          setPasswordStatus('success');
          setPasswordMessage('Contraseña actualizada correctamente');
          setPasswordForm({ current: '', new: '', confirm: '' });
      } else {
          setPasswordStatus('error');
          setPasswordMessage('Error al actualizar la contraseña');
      }
  };
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    setMessageInput('');
  };

  const initiateJoin = (t: Tournament) => setJoinModalTournament(t);
  
  const confirmJoin = () => {
      if (joinModalTournament) {
          onJoinTournament(client.id, joinModalTournament.id);
          setJoinModalTournament(null);
      }
  };
  
  const confirmLeave = async () => {
    if (leaveConfirmId && onLeaveTournament) {
        await onLeaveTournament(leaveConfirmId);
        setLeaveConfirmId(null);
    }
  };

  const handleOpenExternalInvite = (tournamentId: string) => {
      setCurrentInviteTournamentId(tournamentId);
      setInviteModalOpen(true);
      setInviteStatus('idle');
      setInviteEmail('');
  };

  const submitExternalInvite = () => {
      setInviteStatus('sending');
      setTimeout(() => {
          setInviteStatus('success');
          setTimeout(() => setInviteModalOpen(false), 1500);
      }, 1000);
  };

  const onDismissNotification = () => setNotificationQueue(prev => prev.slice(1));
  void onDismissNotification;
  
  const renderRankCard = () => {
    const gameHistoryForRank = activeGameHistory.map(g => {
         const isWhite = g.white_player_id === client.id;
         const winnerColor = g.winner || g.winner_color;
         const isWin = (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
         return { isWin, playedAt: g.played_at };
    });
    const { newRank } = calculateNewRank(gameHistoryForRank);
    return (
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden flex items-center justify-between mb-6">
          <div>
              <div className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Rango Actual</div>
              <div className="flex items-center gap-3">
                  <RankBadge rankId={newRank.id} size="md" />
                  <div>
                      <div className="text-2xl font-bold">{newRank.name}</div>
                      <div className="text-xs text-slate-400">{client.skillRating} ELO</div>
                  </div>
              </div>
          </div>
          <div className="hidden md:block">
               <Trophy size={48} className="text-amber-500 opacity-20" />
          </div>
      </div>
    );
  };

  const renderHistory = () => (
      <div className="space-y-6 animate-in fade-in duration-500">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock size={24} className="text-primary"/> Panel y Registro de Partidas
          </h2>

          <KingOfTheHill />

          {/* Rank Card at Top of Dashboard */}
          {renderRankCard()}
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* ... existing cards ... */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">Partidas Totales</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{activeGameHistory.length}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">Victorias</div>
                  <div className="text-2xl font-bold text-emerald-600">{activeGameHistory.filter(g => {
                      const isWhite = g.white_player_id === client.id;
                      const winnerColor = g.winner || g.winner_color;
                      return (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
                  }).length}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">Derrotas</div>
                  <div className="text-2xl font-bold text-rose-600">{activeGameHistory.filter(g => {
                      const isWhite = g.white_player_id === client.id;
                      const winnerColor = g.winner || g.winner_color;
                      return !((isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black'));
                  }).length}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">Ratio Victorias</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {activeGameHistory.length > 0 ? Math.round((activeGameHistory.filter(g => {
                        const isWhite = g.white_player_id === client.id;
                        const winnerColor = g.winner || g.winner_color;
                        return (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
                    }).length / activeGameHistory.length) * 100) : 0}%
                  </div>
              </div>
          </div>

          {/* New Match Summary Dashboard (By Opponent) */}
          <MatchSummaryDashboard currentUserId={client.id} />
          
          {/* Redundant history table removed as per user request (MatchSummaryDashboard covers it) */}

      </div>
  );

  // --- RENDER HELPERS ---

  const renderInfoPage = (title: string, content: React.ReactNode) => (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto shadow-sm">
      <div className="flex items-center justify-between mb-8 border-b border-slate-200 dark:border-slate-700 pb-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={() => setActiveTab('lobby')} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm font-medium">
            <ArrowLeft size={16} /> Volver a la Sala
          </button>
      </div>
      <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 whitespace-pre-line">{content}</div>
    </div>
  );

  const renderLobby = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden group">
             {/* Background decoration */}
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Trophy size={120} />
             </div>
             
             {/* Rank Display moved to Shared Helper and History Tab, simplified here or removed? 
                 Kept duplicate for Lobby for now as per design, but Dashboard (History) is main view. 
             */}
             <div className="relative z-10 flex flex-col items-center justify-center h-full text-center">
                 <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-2">Rango de Torneo</h3>
                 <div className="text-2xl font-bold flex items-center gap-2">
                     <RankBadge rankId={calculateNewRank(activeGameHistory.map(g => ({
                        isWin: (g.white_player_id === client.id && (g.winner === 'white' || g.winner_color === 'white')) || 
                               (g.black_player_id === client.id && (g.winner === 'black' || g.winner_color === 'black')),
                        playedAt: g.played_at
                     }))).newRank.id} size="sm" />
                 </div>
                 <button onClick={() => setActiveTab('history')} className="mt-4 text-xs text-primary hover:underline">Ver Estadísticas Completas</button>
             </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
             <div className="flex justify-between items-start">
                <div><h3 className="text-slate-500 dark:text-slate-400 font-medium text-sm mb-1">Ganancias Totales</h3><div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">${client.stats.totalPrizeMoney}</div></div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-full text-emerald-600 dark:text-emerald-400"><CreditCard size={24} /></div>
             </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
             <div className="flex justify-between items-start">
                <div><h3 className="text-slate-500 dark:text-slate-400 font-medium text-sm mb-1">Jugados</h3><div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{client.stats.tournamentsPlayed}</div></div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-full text-blue-600 dark:text-blue-400"><Layout size={24} /></div>
             </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Trophy className="text-orange-500" size={20}/> Sala de Torneos</h3>
         </div>
         <div className="overflow-x-auto">
             <table className="w-full text-left">
                 <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                     <tr>
                         <th className="px-6 py-4">Nombre del Evento</th>
                         <th className="px-6 py-4">Formato</th>
                         <th className="px-6 py-4 text-right">Entrada</th>
                         <th className="px-6 py-4 text-right">Premio</th>
                         <th className="px-6 py-4 text-center">Jugadores</th>
                         <th className="px-6 py-4 text-center">Acción</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                     {activeTournaments.filter(t => t.status !== 'Cancelled' && t.status !== 'Archived').map((t) => {
                         const isJoined = t.participants?.includes(client.id) || false;
                         return (
                         <tr key={t.id} className="hover:bg-slate-400/5 dark:hover:bg-slate-700/30 group">
                             <td className="px-6 py-4">
                                 <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                     {t.name}
                                     {isJoined && <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Unido</span>}
                                 </div>
                                 <div className="text-xs text-slate-500">{new Date(t.startDate).toLocaleString()}</div>
                             </td>
                             <td className="px-6 py-4"><span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-xs font-medium">{t.format}</span></td>
                             <td className="px-6 py-4 text-right font-mono text-slate-700 dark:text-slate-300">{t.buyIn === 0 ? 'GRATIS' : `$${t.buyIn}`}</td>
                             <td className="px-6 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">${t.prizePool}</td>
                             <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">{t.currentPlayers} / {t.maxPlayers}</td>
                             <td className="px-6 py-4 text-center">
                                 <div className="flex justify-center gap-2">
                                     {t.status === 'Open' ? (
                                        isJoined ? (
                                            <>
                                                <button disabled className="bg-slate-100 dark:bg-slate-700 text-slate-400 px-4 py-2 rounded-lg text-sm font-bold cursor-not-allowed flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> Unido</button>
                                                <button onClick={() => setLeaveConfirmId(t.id)} className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleOpenExternalInvite(t.id)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Invitar a un Amigo"><UserPlus size={18} /></button>
                                                <button onClick={() => initiateJoin(t)} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">Unirse Ahora</button>
                                            </>
                                        )
                                     ) : <span className="text-slate-400 text-sm font-medium">Cerrado</span>}
                                 </div>
                             </td>
                         </tr>
                     )})}
                 </tbody>
             </table>
         </div>
      </div>
    </div>
  );

  const renderMyTournaments = () => {
      const myTournaments = activeTournaments.filter(t => t.participants?.includes(client.id));
      
      const handleEnterMatch = (tournamentId: string) => {
          // In a real implementation this would navigate to the game room
          const gameUrl = `/game?tournamentId=${tournamentId}&mode=human`;
          window.open(gameUrl, '_self');
      };

      return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Mis Competiciones</h2>
            {myTournaments.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Trophy size={48} className="mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">Sin Torneos Activos</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">No te has unido a ningún torneo próximo todavía.</p>
                    <button onClick={() => setActiveTab('lobby')} className="bg-primary text-white px-6 py-2 rounded-lg font-bold">Explorar Sala</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myTournaments.map(t => (
                        <div key={t.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Trophy size={100} /></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider inline-block">Unido</span>
                                    {t.status === 'In Progress' && (
                                        <span className="flex items-center gap-1 text-red-500 text-xs font-bold animate-pulse">
                                            <span className="w-2 h-2 bg-red-500 rounded-full"></span> EN VIVO
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2"><Clock size={14}/> Comienza: {new Date(t.startDate).toLocaleString()}</p>
                                
                                <div className="flex gap-3">
                                    {t.status === 'In Progress' ? (
                                        <button 
                                            onClick={() => handleEnterMatch(t.id)}
                                            className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-rose-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                                        >
                                            <Gamepad2 size={18} /> Entrar a Partida
                                        </button>
                                    ) : (
                                        <button disabled className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed">
                                            Esperando para Empezar
                                        </button>
                                    )}
                                    
                                    <button onClick={() => setLeaveConfirmId(t.id)} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors" title="Retirarse">
                                        <LogOut size={18}/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* Player Directory Section */}
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Users size={24} className="text-primary"/> 
                    Jugadores de la Comunidad
                </h3>
                
                {directoryView === 'list' ? (
                    <UserPlayerDirectory 
                        currentUserId={client.id}
                        clients={allClients}
                        onlineUserIds={onlineUserIds} 
                        onInvite={async (id) => {
                            // Find the user to get their name for the log/optimistic update
                            const targetUser = allClients.find(c => c.id === id);
                            const targetName = targetUser ? targetUser.firstName : 'Jugador';
                            
                            try {
                                if (sendGameInvite) {
                                    await sendGameInvite(id, targetName);
                                    alert(`¡Invitación enviada a ${targetName}!`);
                                }
                            } catch (err) {
                                console.error("Invite error:", err);
                                alert(err instanceof Error ? err.message : "Error al enviar la invitación. Inténtalo de nuevo.");
                            }
                        }}
                        onViewHistory={(id, name) => {
                            setSelectedOpponent({ id, name });
                            setDirectoryView('history');
                        }}
                    />
                ) : (
                    selectedOpponent && (
                        <PlayerHistoryView 
                            currentUserId={client.id}
                            opponentId={selectedOpponent.id}
                            opponentName={selectedOpponent.name}
                            onBack={() => {
                                setDirectoryView('list');
                                setSelectedOpponent(null);
                            }}
                        />
                    )
                )}
            </div>
        </div>
      );
  };

  const renderWallet = () => (
      <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                  <p className="text-indigo-100 font-medium mb-1">Saldo Disponible</p>
                  <h2 className="text-4xl font-bold mb-6">${points.toLocaleString()}.00</h2>
                  <div className="flex gap-3">
                      {points <= 0 ? (
                          <button 
                              onClick={async () => {
                                  try {
                                      // Buscar admins
                                      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
                                      if (admins && admins.length > 0) {
                                          const notifications = admins.map((a: { id: string }) => ({
                                              client_id: a.id,
                                              sender: 'system',
                                              content: `El usuario ${client.firstName} ${client.lastName} (${client.email}) ha solicitado una recarga de puntos (Saldo Actual: 0).`,
                                              type: 'system',
                                              read: false
                                          }));
                                          await supabase.from('notifications').insert(notifications);
                                          alert("¡Solicitud enviada a los administradores!");
                                      }
                                  } catch (err) {
                                      console.error("Error al solicitar puntos:", err);
                                      alert("Hubo un error al pedir puntos.");
                                  }
                              }}
                              className="px-6 py-2 bg-rose-500 text-white rounded-lg font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30 animate-pulse"
                          >
                              Solicitar Puntos al Admin
                          </button>
                      ) : (
                          <>
                              <button className="px-6 py-2 bg-white text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 transition-colors">Depositar</button>
                              <button className="px-6 py-2 bg-indigo-700 text-white rounded-lg font-bold hover:bg-indigo-800 transition-colors border border-indigo-500">Retirar</button>
                          </>
                      )}
                  </div>
              </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Transacciones Recientes</h3>
              <div className="space-y-4">
                  {loadingTransactions ? (
                      <div className="text-center py-4 text-slate-400">Cargando transacciones...</div>
                  ) : transactions.length === 0 ? (
                      <div className="text-center py-4 text-slate-400">No hay transacciones recientes.</div>
                  ) : transactions.map(tx => {
                      const isPositive = tx.tipo === 'win' || tx.tipo === 'bonus' || tx.tipo === 'initial';
                      return (
                      <div key={tx.tx_id} className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
                          <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${isPositive ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                  {isPositive ? <Trophy size={16}/> : <AlertTriangle size={16}/>}
                              </div>
                              <div>
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {tx.descripcion?.replace('Won against AI', 'Victoria contra IA')
                                                 ?.replace('Lost against AI', 'Derrota contra IA')
                                                 ?.replace('Bounty:', 'Recompensa:')
                                                 ?.replace('Admin gift', 'Regalo de Admin') || 'Transacción'}
                                  </div>
                                  <div className="text-xs text-slate-500">{new Date(tx.timestamp).toLocaleString()}</div>
                              </div>
                          </div>
                          <div className="text-right">
                              <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isPositive ? '+' : '-'}${tx.amount || tx.points_ganados || tx.points_perdidos}
                              </span>
                              <div className="text-[10px] text-slate-400 font-mono">Saldo: ${tx.saldo_nuevo || tx.saldo_despues}</div>
                          </div>
                      </div>
                  )})}
              </div>
          </div>
      </div>
  );

  const renderSettings = () => (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">
          <h2 className="text-2xl font-bold text-foreground">Ajustes de Cuenta</h2>
          
          <div className="bg-panel rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2"><User size={18}/> Detalles del Perfil</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase">Nombre</label>
                      <input type="text" value={profileForm.firstName} onChange={e => setProfileForm({...profileForm, firstName: e.target.value})} className="w-full p-2 border border-border rounded bg-background text-foreground"/>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase">Apellidos</label>
                      <input type="text" value={profileForm.lastName} onChange={e => setProfileForm({...profileForm, lastName: e.target.value})} className="w-full p-2 border border-border rounded bg-background text-foreground"/>
                  </div>
              </div>
              <button onClick={handleUpdateProfileSubmit} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">Actualizar Perfil</button>
              {profileSuccess && <span className="text-emerald-500 text-sm ml-2">¡Guardado!</span>}
          </div>

<div className="bg-panel rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Settings size={18}/> Preferencias</h3>
              <div className="flex gap-2">
                  {['light', 'dark', 'system'].map((t) => (
                  <button key={t} onClick={() => onUpdateTheme(t as 'light' | 'dark' | 'system')} className={`px-4 py-2 rounded-lg text-sm border transition-colors ${currentTheme === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                      {t === 'system' ? 'PC (Sistema)' : t === 'light' ? 'Claro' : 'Oscuro'}
                  </button>
                  ))}
              </div>
              
              {/* AI Taunts Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex flex-col">
                      <span className="font-medium text-foreground">Burlas de la IA</span>
                      <span className="text-xs text-muted-foreground">Muestra comentarios sarcásticos del oponente de IA</span>
                  </div>
                  <button 
                      onClick={() => setAiTauntsEnabled(!aiTauntsEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiTauntsEnabled ? 'bg-amber-500' : 'bg-slate-600'}`}
                  >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiTauntsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>
              
              {/* Gemini AI Taunts Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex flex-col">
                      <span className="font-medium text-foreground">Burlas de la IA (Avanzado)</span>
                      <span className="text-xs text-muted-foreground">Burlas más inteligentes generadas por la IA basadas en los eventos del juego</span>
                  </div>
                  <button 
                      onClick={() => setGeminiTauntsEnabled(!geminiTauntsEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${geminiTauntsEnabled ? 'bg-purple-500' : 'bg-slate-600'}`}
                  >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${geminiTauntsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>

              {/* Training Mode Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex flex-col">
                      <span className="font-medium text-foreground">Modo Entrenamiento (Ver Ventaja)</span>
                      <span className="text-xs text-muted-foreground">Muestra la barra de ventaja y desactiva las apuestas al jugar contra la IA</span>
                  </div>
                  <button 
                      onClick={() => setTrainingModeEnabled(!trainingModeEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${trainingModeEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                  >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${trainingModeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>
          </div>

          <div className="bg-panel rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Lock size={18}/> Seguridad</h3>
              <input type="password" placeholder="Contraseña Actual" value={passwordForm.current} onChange={e => setPasswordForm({...passwordForm, current: e.target.value})} className="w-full p-2 border border-border rounded bg-background text-foreground"/>
              <input type="password" placeholder="Nueva Contraseña" value={passwordForm.new} onChange={e => setPasswordForm({...passwordForm, new: e.target.value})} className="w-full p-2 border border-border rounded bg-background text-foreground"/>
              <input type="password" placeholder="Confirmar Nueva Contraseña" value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})} className="w-full p-2 border border-border rounded bg-background text-foreground"/>
              <button onClick={handlePasswordSubmit} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">Cambiar Contraseña</button>
              {passwordStatus === 'success' && <p className="text-emerald-500 text-sm">{passwordMessage}</p>}
              {passwordStatus === 'error' && <p className="text-rose-500 text-sm">{passwordMessage}</p>}
          </div>

          {/* Hand Tracking Calibration Status */}
          <CalibrationStatusPanel />

          <div className="pt-6 border-t border-border">
              <button onClick={() => setShowDeleteAccountConfirm(true)} className="text-rose-600 hover:text-rose-700 text-sm font-bold flex items-center gap-2"><Trash2 size={16}/> Eliminar Cuenta</button>
          </div>
      </div>
  );

  const renderMessages = () => (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 h-[600px] flex flex-col shadow-sm animate-in fade-in duration-500">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Mail size={18}/> Chat de Soporte</h3>
              <span className="text-xs text-slate-500">Línea directa con los organizadores</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
              {client.messages && client.messages.length > 0 ? client.messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-bl-none text-slate-800 dark:text-slate-100'}`}>
                          <p>{msg.content}</p>
                          <span className="text-[10px] opacity-70 block mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                  </div>
              )) : <div className="text-center text-slate-400 mt-10">Aún no hay mensajes.</div>}
              <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              <input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} placeholder="Escribe tu mensaje..." className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-900 dark:text-white"/>
              <button type="submit" className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90"><ArrowLeft size={18} className="rotate-180" /></button>
          </form>
      </div>
  );

  const renderRules = () => renderInfoPage("Reglas Oficiales del Torneo", tournamentRules);

  const renderTerms = () => renderInfoPage("Términos de Servicio", `
      1. Aceptación de Términos
      Al acceder y utilizar esta plataforma, usted acepta y acuerda estar sujeto a los términos y disposiciones de este acuerdo.

      2. Elegibilidad
      Debe tener al menos 18 años de edad para usar este servicio. Al usar este servicio y al aceptar estos términos, usted garantiza y declara que tiene al menos 18 años de edad.

      3. Cumplimiento de Juegos de Habilidad
      Esta plataforma ofrece competiciones basadas en habilidades. El resultado de todos los partidos está determinado por la habilidad física y mental del jugador. La aleatoriedad es un factor pero no determina el ganador a largo plazo.

      4. Cuentas de Usuario
      Usted es responsable de mantener la confidencialidad de su cuenta y contraseña y de restringir el acceso a su computadora.

      5. Terminación
      Podemos terminar o suspender el acceso a nuestro Servicio inmediatamente, sin previo aviso o responsabilidad, por cualquier motivo, incluyendo sin limitación si usted incumple los Términos.
  `);

  const renderPrivacy = () => renderInfoPage("Política de Privacidad", `
      1. Recopilación de Datos
      Recopilamos información que usted nos proporciona directamente, como cuando crea una cuenta, actualiza su perfil o se comunica con nosotros.

      2. Uso de la Información
      Usamos la información que recopilamos para operar, mantener y mejorar nuestros servicios, como procesar transacciones, identificarlo como usuario y enviarle información relacionada.

      3. Seguridad de Datos
      Implementamos medidas técnicas y organizativas apropiadas para proteger la seguridad de su información personal.

      4. Cookies
      Usamos cookies para mejorar su experiencia. Al usar nuestro sitio web, acepta el uso de cookies de acuerdo con nuestra política de privacidad.

      5. Servicios de Terceros
      Podemos usar servicios de terceros (por ejemplo, procesadores de pago) que recopilan, monitorean y analizan este tipo de información.
  `);

  // --- MAIN APP SHELL RENDER ---
  return (
    <div className="flex h-screen bg-background text-foreground font-sans transition-colors duration-200">
      
      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm md:hidden animate-in fade-in">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <span className="text-xl font-bold text-white flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-base font-mono font-bold">
                {points.toLocaleString()} pts
              </span>
            </span>
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400"><X size={24} /></button>
          </div>
          <nav className="p-6 space-y-4">
             {['history', 'lobby', 'my_tournaments', 'wallet', 'messages', 'settings'].map(tab => {
                 const labels: Record<string, string> = {
                   history: 'Panel Principal',
                   lobby: 'Sala (Lobby)',
                   my_tournaments: 'Mis Torneos',
                   wallet: 'Billetera',
                   messages: 'Mensajes',
                   settings: 'Ajustes'
                 };
                 return (
                   <button key={tab} onClick={() => handleMobileNav(tab as ClientTab)} className="block w-full text-left text-lg font-medium text-slate-300 py-2">{labels[tab] || tab.replace('_', ' ')}</button>
                 );
             })}
             
             {/* PLAY TRAINING Button - Mobile */}
             <button 
               onClick={() => { 
                 navigate('/game?mode=training'); 
                 setIsMobileMenuOpen(false);
               }} 
               className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-md"
             >
               <Gamepad2 size={18}/> 🎯 JUGAR ENTRENAMIENTO
             </button>

             {client.role === 'admin' && (
                 <button 
                   onClick={() => navigate('/admin')} 
                   className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all bg-gradient-to-r from-slate-800 to-slate-950 text-white hover:from-slate-700 hover:to-slate-900 shadow-md border border-slate-700 mt-2"
                 >
                   <ShieldAlert size={18}/> ADMIN CRM
                 </button>
             )}
             
             <button onClick={onLogout} className="block w-full text-left text-lg font-medium text-rose-500 py-2">Cerrar Sesión</button>
          </nav>
        </div>
      )}

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-panel border-r border-border z-10">
          <div className="p-6 border-b border-border">
              <h1 className="text-xl font-bold text-foreground flex flex-col">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-base font-mono font-bold">
                      {points.toLocaleString()} pts
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground opacity-80">
                    {client.firstName} ({client.id.split('-')[0]})
                  </span>
              </h1>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {/* History First (Dashboard) */}
              <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Clock size={18}/> Panel Principal</button>
              {/* Lobby Second */}
              <button onClick={() => setActiveTab('lobby')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'lobby' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Layout size={18}/> Sala (Lobby)</button>
              
              <button onClick={() => setActiveTab('my_tournaments')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'my_tournaments' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Trophy size={18}/> Mis Torneos</button>
              <button onClick={() => setActiveTab('wallet')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'wallet' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Wallet size={18}/> Billetera</button>
              
              {/* PLAY TRAINING Button */}
              <button 
                onClick={() => navigate('/game?mode=training')} 
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-md hover:shadow-lg"
              >
                <Gamepad2 size={18}/> 🎯 JUGAR ENTRENAMIENTO
              </button>

              {client.role === 'admin' && (
                  <button 
                    onClick={() => navigate('/admin')} 
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all bg-gradient-to-r from-slate-800 to-slate-950 text-white hover:from-slate-700 hover:to-slate-900 shadow-md hover:shadow-lg mt-2 border border-slate-700"
                  >
                    <ShieldAlert size={18}/> ADMIN CRM
                  </button>
              )}
              
              <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Settings size={18}/> Ajustes</button>
              
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => setActiveTab('rules')} className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500 hover:text-primary transition-colors"><Info size={14}/> Reglas</button>
                  <button onClick={() => setActiveTab('terms')} className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500 hover:text-primary transition-colors"><FileText size={14}/> Términos</button>
                  <button onClick={() => setActiveTab('privacy')} className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500 hover:text-primary transition-colors"><ShieldCheck size={14}/> Privacidad</button>
              </div>
          </nav>
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg text-sm font-medium transition-colors"><LogOut size={18}/> Cerrar Sesión</button>
          </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
         <header className="h-16 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shrink-0">
             <div className="md:hidden"><button onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} className="text-slate-600 dark:text-slate-300"/></button></div>
             <div className="ml-auto flex items-center gap-4">
                 <div className="hidden md:block text-right">
                     <div className="text-sm font-bold text-slate-900 dark:text-white">{client.firstName} {client.lastName}</div>
                     <div className="text-xs text-slate-500 dark:text-slate-400">{client.email}</div>
                 </div>
                 <img src={client.avatar} alt="Profile" className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-600"/>
             </div>
         </header>

         <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-6xl mx-auto pb-20">
              {activeTab === 'lobby' && renderLobby()}
              {activeTab === 'my_tournaments' && renderMyTournaments()}
              {activeTab === 'history' && renderHistory()}
              {activeTab === 'wallet' && renderWallet()}
              {activeTab === 'messages' && renderMessages()}
              {activeTab === 'settings' && renderSettings()}
              {activeTab === 'rules' && renderRules()}
              {activeTab === 'terms' && renderTerms()}
              {activeTab === 'privacy' && renderPrivacy()}
            </div>
         </div>
      </main>

      {/* --- MODALS --- */}
      {showNotification && (
          <div className="fixed bottom-6 right-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl p-4 rounded-xl flex items-start gap-3 z-50 animate-in slide-in-from-right duration-300 max-w-sm">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-full"><Mail size={16}/></div>
              <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Nuevo Mensaje</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Has recibido un nuevo mensaje de soporte.</p>
                  <div className="flex gap-2 mt-2">
                      <button onClick={() => {setActiveTab('messages'); setShowNotification(false)}} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium">Ver</button>
                      <button onClick={() => setShowNotification(false)} className="text-xs text-slate-500 px-2 py-1.5">Descartar</button>
                  </div>
              </div>
          </div>
      )}

      {/* External Invite Modal */}
      {inviteModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Mail size={20} className="text-blue-500"/> Invitar Amigo</h3>
                  {inviteStatus === 'success' ? (
                      <div className="text-center py-4"><CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-2"/><p className="text-slate-900 dark:text-white">¡Invitación Enviada!</p></div>
                  ) : (
                      <>
                          <input type="email" placeholder="amigo@ejemplo.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full p-3 rounded-lg border dark:bg-slate-900 dark:border-slate-600 dark:text-white mb-4"/>
                          <div className="flex gap-2">
                              <button onClick={() => setInviteModalOpen(false)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300">Cancelar</button>
                              <button onClick={submitExternalInvite} disabled={!inviteEmail || inviteStatus === 'sending'} className="flex-1 py-2 bg-blue-600 text-white rounded-lg">{inviteStatus === 'sending' ? '...' : 'Enviar'}</button>
                          </div>
                      </>
                  )}
              </div>
          </div>
      )}

      {/* Join/Pay Modal */}
      {joinModalTournament && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
                  <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">{joinModalTournament.buyIn === 0 ? 'Unirse al Modo de Práctica' : 'Confirmar Registro'}</h3>
                      <button onClick={() => setJoinModalTournament(null)}><X size={20} className="text-slate-400"/></button>
                  </div>
                  <div className="p-6">
                      <p className="text-slate-600 dark:text-slate-300 mb-4">Estás a punto de unirte a <strong>{joinModalTournament.name}</strong>.</p>
                      {joinModalTournament.buyIn > 0 && <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 flex justify-between items-center"><span className="text-sm font-medium">Entrada</span><span className="text-xl font-bold text-emerald-600">${joinModalTournament.buyIn}</span></div>}
                  </div>
                  <div className="p-6 pt-0 flex gap-3">
                      <button onClick={() => setJoinModalTournament(null)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl font-bold">Rechazar</button>
                      <button onClick={confirmJoin} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700">Unirse Ahora</button>
                  </div>
              </div>
          </div>
      )}

      {/* Leave Modal */}
      {leaveConfirmId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
                  <div className="flex gap-3 mb-4 text-rose-600"><AlertTriangle size={24}/><h3 className="font-bold text-lg text-slate-900 dark:text-white">¿Retirarse?</h3></div>
                  <p className="text-slate-500 mb-6 text-sm">¿Estás seguro de que quieres abandonar este torneo? Los reembolsos son automáticos.</p>
                  <div className="flex gap-3">
                      <button onClick={() => setLeaveConfirmId(null)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg">Cancelar</button>
                      <button onClick={confirmLeave} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Retirarse</button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Account Modal */}
          {showDeleteAccountConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl max-w-md shadow-2xl">
                      <h3 className="text-lg font-bold text-rose-600 mb-2">⚠️ Eliminar Cuenta</h3>
                      <p className="text-slate-600 dark:text-slate-300 mb-4">Esta acción es permanente. Todos tus datos se perderán.</p>
                      <div className="flex gap-3 justify-end">
                          <button onClick={() => setShowDeleteAccountConfirm(false)} className="px-4 py-2 border rounded-lg">Cancelar</button>
                          <button onClick={() => { onDeleteAccount(client.id); setShowDeleteAccountConfirm(false); }} className="px-4 py-2 bg-rose-600 text-white rounded-lg">Eliminar</button>
                      </div>
                  </div>
              </div>
          )}
          
          {/* Notification Popups */}
          {notificationQueue.length > 0 && notificationQueue[0] && (
            <NotificationPopup
              message={notificationQueue[0]!}
              onDismiss={() => setNotificationQueue(prev => prev.slice(1))}
            />
          )}
    </div>
  );
};
