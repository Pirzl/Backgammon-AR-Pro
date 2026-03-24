import React, { useState, useEffect } from 'react';
import { Users, DollarSign, Activity, Trophy, LayoutGrid, MessageSquare, Database, Circle, RefreshCw, Gift } from 'lucide-react';
import { AdminAwardPoints } from './AdminAwardPoints';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from './StatCard';
import { ClientList } from './ClientList';
import { TournamentManager } from './TournamentManager';
import { STORAGE_TABLE_DESCRIPTIONS } from '../constants';
import { MessageCenter } from './MessageCenter';
import { MessageNotificationPanel } from './MessageNotificationPanel';
import { GraphFilters } from './GraphFilters';
import { useAdminStats, useAIEconomyStats } from '../hooks/useAdminStats';
import { useTournaments } from '../hooks/useTournaments';
import { useClients } from '../hooks/useClients';
import { useRealtimeActivity } from '../hooks/useRealtimeActivity';
import { useStorageMonitoring } from '../hooks/useStorageMonitoring';
import { useMatchParticipation, type ParticipationFilters } from '../hooks/useMatchParticipation';
import { useNavigate } from 'react-router-dom';
import { useAdminUnreadCount } from '../../messaging/hooks/useUnreadCounts';
import { supabase } from '../../../shared/api/supabase';

// This tool call is effectively "Find and Replace" for the whole file using specific patterns.
// Since replace_file_content requires exact blocks, I will target specific sections.

// ... Actually, given the complexity and number of occurrences, I will do this in multiple chunks or use multi_replace.
// I'll start with the Header and Stats Cards section.

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tournaments' | 'messages' | 'points'>('overview');
  const [adminId, setAdminId] = useState<string>('');
  
  // Custom Hooks
  const { stats, loading: statsLoading } = useAdminStats();
  const { stats: economyStats, loading: economyLoading } = useAIEconomyStats();
  const { tournaments, createTournament, archiveTournament, toggleStatus } = useTournaments();
  const { clients } = useClients();
  const { players, onlineCount, registeredCount, loading: activityLoading } = useRealtimeActivity();
  const { stats: storageStats, loading: storageLoading, isNearLimit, isCritical, refresh: refreshStorage } = useStorageMonitoring();
  const navigate = useNavigate();

  // Get current admin user ID
  useEffect(() => {
    supabase.auth.getUser().then(r => {
      if (r.data.user?.id) {
        setAdminId(r.data.user.id);
      }
    });
  }, []);
  
  // Real-time unread message count from new messaging system
  const { count: unreadMessagesCount } = useAdminUnreadCount(adminId);

  // Invite Logic
  const handleInviteUser = async (userId: string) => {
      try {
          const roomId = `match_${Date.now()}`; // Generate ID first
          
          const { error } = await supabase
              .from('invitations')
              .insert({
                  sender_id: adminId,
                  receiver_id: userId,
                  status: 'pending',
                  room_id: roomId // Use generated ID
              });
          
          if (error) throw error;
          
          // Notify and Redirect
          // alert(`Invitation sent to user ${userId}`); // Removed alert for smoother flow
          navigate(`/game?room=${roomId}&mode=human`);
          
      } catch (err) {
          console.error('Error sending invite:', err);
          alert('Failed to send invitation');
      }
  };

  // Navigation for Client Selection
  const handleSelectClient = (id: string) => {
      navigate(`/admin/players?id=${id}`);
  };

  // --- Graph Configuration State ---
  const [graphFilters, setGraphFilters] = useState<ParticipationFilters>({});
  
  // --- Real Data: Participation Trend from game_logs ---
  const { data: participationData, loading: participationLoading } = useMatchParticipation(graphFilters);

  // Merge clients with real-time status
  const clientsWithStatus = clients.map(client => {
      const realtimePlayer = players.find(p => p.id === client.id);
      return {
          ...client,
          status: realtimePlayer?.isOnline ? 'online' : (client.status === 'active' ? 'offline' : client.status)
      };
  });

  // Tournament options for filter dropdown
  const tournamentOptions = tournaments.map(t => ({ id: t.id, name: t.name }));

  // Player options for searchable dropdown
  const playerOptions = clientsWithStatus.map(c => ({
    id: c.id,
    name: c.firstName + (c.lastName ? ` ${c.lastName}` : ''),
    email: c.email
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 bg-background min-h-screen text-foreground p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-foreground">Organizer Dashboard</h2>
            <p className="text-muted-foreground text-sm mt-1">Skill-Based Tournament Metrics.</p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'overview' ? 'bg-primary text-primary-foreground' : 'bg-panel text-muted-foreground hover:bg-muted border border-border'}`}
           >
             <LayoutGrid size={16} /> Overview
           </button>
           <button 
            onClick={() => setActiveTab('tournaments')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'tournaments' ? 'bg-primary text-primary-foreground' : 'bg-panel text-muted-foreground hover:bg-muted border border-border'}`}
           >
             <Trophy size={16} /> Tournaments
           </button>
           <button 
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'messages' ? 'bg-primary text-primary-foreground' : 'bg-panel text-muted-foreground hover:bg-muted border border-border'}`}
           >
             <MessageSquare size={16} /> Message Center
             {unreadMessagesCount > 0 && (
                 <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-background">
                     {unreadMessagesCount}
                 </span>
             )}
           </button>
           <button
            onClick={() => setActiveTab('points')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'points' ? 'bg-amber-500 text-black' : 'bg-panel text-muted-foreground hover:bg-muted border border-border'}`}
           >
             <Gift size={16} /> Award Points
           </button>
           <a 
            href="https://analytics.google.com/analytics/web/#/a370718594p507864262/reports/intelligenthome"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-panel text-blue-500 hover:bg-blue-500/10 border border-blue-500/30"
            title="Ver métricas en Google Analytics"
           >
             <Activity size={16} /> Analytics
           </a>
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
            {/* Compliance Status Banner - Welcome Header */}
            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 
                dark:from-emerald-900/20 dark:to-blue-900/20 
                p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50
                flex flex-col md:flex-row gap-4 items-start md:items-center transition-all duration-300">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Activity size={16} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                    Licensed Organizer Mode
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Skill-based tournaments only. External wallet custody by Xsolla.
                </p>
              </div>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Activity size={12} className="text-emerald-500"/> System Auditing Active
              </span>
            </div>

            {/* Message Notifications - Show when there are unread messages */}
            {unreadMessagesCount > 0 && (
              <MessageNotificationPanel onViewMessages={() => setActiveTab('messages')} />
            )}

            {/* AI Capacity Alert Banner */}
            {onlineCount >= 20 && (
              <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm animate-pulse-slow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-800/50 rounded-full text-red-600 dark:text-red-400">
                    <Activity size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-red-800 dark:text-red-400 font-bold">Alerta: Capacidad de IA Saturada</h4>
                    <p className="text-red-700 dark:text-red-300 text-sm mt-0.5">
                      El sistema detecta {onlineCount} usuarios concurrentes (Límite: 20). La creación de nuevas partidas contra la IA ha sido bloqueada temporalmente para proteger los límites de la cuota gratuita de Google Gemini.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Total Players" 
                    value={stats?.totalUsers.toString() || '0'} 
                    icon={<Users size={24} className="text-blue-600" />} 
                    trend="+12% this week"
                    trendDirection="up"
                    isLoading={statsLoading}
                />
                <StatCard 
                    title="Tournaments Played" 
                    value={stats?.tournamentsCompleted.toString() || '0'} 
                    icon={<Trophy size={24} className="text-purple-600" />} 
                    isLoading={statsLoading}
                />
                <StatCard 
                    title="Entry Fees" 
                    value={`$${stats?.totalEntryFeesCollected || '0'}`} 
                    icon={<DollarSign size={24} className="text-emerald-600" />} 
                    trend="+8% vs last month"
                    trendDirection="up"
                    isLoading={statsLoading}
                />
                <StatCard 
                    title="Prizes Distributed" 
                    value={`$${stats?.totalPrizesDistributed || '0'}`} 
                    icon={<DollarSign size={24} className="text-green-500" />} 
                    isLoading={statsLoading}
                />
                <StatCard 
                    title="Global Points" 
                    value={`${economyStats.totalCirculatingPoints.toLocaleString()} pts`} 
                    icon={<Database size={24} className="text-yellow-500" />} 
                    isLoading={economyLoading}
                />
                <StatCard 
                    title="AI Payouts (Minted)" 
                    value={`${economyStats.totalGivenByAI.toLocaleString()} pts`} 
                    icon={<Trophy size={24} className="text-green-500" />} 
                    isLoading={economyLoading}
                />
                <StatCard 
                    title="AI Wins (Reclaimed)" 
                    value={`${economyStats.totalTakenByAI.toLocaleString()} pts`} 
                    icon={<Activity size={24} className="text-red-500" />} 
                    isLoading={economyLoading}
                />
            </div>

            {/* Charts Row - Responsive Layout */}
            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
                
                {/* Mobile Only: Filters ABOVE Graph */}
                <div className="lg:hidden bg-panel p-6 rounded-xl border border-border shadow-sm">
                  <h3 className="text-lg font-bold text-foreground mb-4">Graph Filters</h3>
                  <GraphFilters 
                    filters={graphFilters} 
                    onFiltersChange={setGraphFilters}
                    tournaments={tournamentOptions}
                    players={playerOptions}
                  />
                </div>
                
                {/* Participation Graph (full width mobile, 2/3 desktop) */}
                <div className="lg:col-span-2 bg-panel p-6 rounded-xl border border-border shadow-sm relative">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Participation</h3>
                          <p className="text-sm text-muted-foreground">Matches played over selected period</p>
                        </div>
                        {participationLoading && (
                          <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                        )}
                    </div>
                    
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={participationData}>
                                <defs>
                                    <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'currentColor', fontSize: 12}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: 'currentColor', fontSize: 12}} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    
                    {/* No data message */}
                    {participationData.length > 0 && participationData.every(d => d.count === 0) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
                        <p className="text-muted-foreground text-sm">No match data for selected period</p>
                      </div>
                    )}
                </div>

                {/* Desktop Only: Filters RIGHT of Graph */}
                <div className="hidden lg:block bg-panel p-6 rounded-xl border border-border shadow-sm">
                  <h3 className="text-lg font-bold text-foreground mb-4">Graph Filters</h3>
                  <GraphFilters 
                    filters={graphFilters} 
                    onFiltersChange={setGraphFilters}
                    tournaments={tournamentOptions}
                    players={playerOptions}
                  />
                </div>
            </div>

            {/* NEW: Real-time Player Activity Section */}
            <div className="bg-panel p-6 rounded-xl border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Live Player Activity
                </h3>
                {activityLoading && (
                  <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Activity Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Circle className="w-3 h-3 text-green-500 fill-green-500 animate-pulse" />
                    <span className="text-sm text-foreground">Online Now</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {onlineCount}
                  </span>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-3 h-3 text-blue-500" />
                    <span className="text-sm text-foreground">Registered Users</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {registeredCount}
                  </span>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3 h-3 text-purple-500" />
                    <span className="text-sm text-foreground">Active Games</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    0
                  </span>
                </div>
              </div>

              {/* Player List with Online Indicators */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {players.slice(0, 10).map(player => (
                  <div 
                    key={player.id} 
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <Circle 
                      className={`w-2.5 h-2.5 flex-shrink-0 ${
                        player.isOnline 
                          ? 'text-green-500 fill-green-500 animate-pulse' 
                          : 'text-gray-400 fill-gray-400'
                      }`} 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">
                          {player.username}
                        </span>
                        {player.role === 'admin' && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Last seen: {new Date(player.lastSeen).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {players.length === 0 && !activityLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">No players found</p>
                )}
              </div>
            </div>

            {/* Player Directory - Moved up before Storage */}
            <div className="pt-4">
            {/* Player Directory - Moved up before Storage */}
            <div className="pt-4">
            {/* Player Directory - Moved up before Storage */}
            <div className="pt-4">
                <ClientList 
                    clients={clientsWithStatus} 
                    onSelectClient={handleSelectClient} 
                    onInviteClient={handleInviteUser}
                />
            </div>
            </div>
            </div>

            {/* Supabase Storage Section */}
            <div className="bg-panel p-6 rounded-xl border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Supabase Storage
                </h3>
                <button
                  onClick={refreshStorage}
                  disabled={storageLoading}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${storageLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {storageStats && (
                <>
                  {/* Storage Progress */}
                  <div className="mb-6">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm text-muted-foreground">
                        Usage: {(storageStats.usedKB / 1024).toFixed(2)} MB / {(storageStats.totalKB / 1024).toFixed(0)} MB
                      </span>
                      <span className={`text-sm font-bold ${
                        isCritical ? 'text-red-600 dark:text-red-400' :
                        isNearLimit ? 'text-yellow-600 dark:text-yellow-400' : 
                        'text-green-600 dark:text-green-400'
                      }`}>
                        {storageStats.percentUsed.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          isCritical ? 'bg-red-500' :
                          isNearLimit ? 'bg-yellow-500' : 
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, storageStats.percentUsed)}%` }}
                      />
                    </div>
                  </div>

                  {/* Warning Alerts */}
                  {isCritical && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">
                      <p className="text-sm text-red-800 dark:text-red-400 font-medium">
                        ⚠️ Critical: Storage is at {storageStats.percentUsed.toFixed(1)}%. Immediate action required.
                      </p>
                    </div>
                  )}
                  {isNearLimit && !isCritical && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-800 dark:text-yellow-400">
                        ⚠️ Warning: Storage approaching limit. Consider archiving old data.
                      </p>
                    </div>
                  )}

                  {/* Table Breakdown */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">
                      Storage by Table
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(storageStats.byTable)
                        .sort((a, b) => b[1].sizeKB - a[1].sizeKB)
                        .slice(0, 8)
                        .map(([tableName, data]) => (
                          <div 
                            key={tableName}
                            className="bg-muted p-3 rounded-lg"
                          >
                            <div className="font-medium text-foreground truncate mb-1">
                              {tableName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {(data.sizeKB / 1024).toFixed(2)} MB • {data.rowCount.toLocaleString()} rows
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 italic">
                                {STORAGE_TABLE_DESCRIPTIONS[tableName] || 'System data table'}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-muted-foreground">
                    Last updated: {new Date(storageStats.lastUpdated).toLocaleTimeString()}
                  </div>
                </>
              )}

              {!storageStats && !storageLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Storage monitoring requires admin access
                </p>
              )}
            </div>
        </>
      )}

      {activeTab === 'tournaments' && (
        <TournamentManager 
            tournaments={tournaments}
            clients={clients}
            onCreateTournament={createTournament}
            onArchiveTournament={archiveTournament}
            onToggleStatus={toggleStatus}
            onInviteUser={handleInviteUser}
        />
      )}


      {activeTab === 'messages' && (
        <MessageCenter 
            clients={clients}
        />
      )}

      {activeTab === 'points' && (
        <div className="bg-panel border border-border rounded-xl p-6">
          <AdminAwardPoints clients={clientsWithStatus} />
        </div>
      )}
    </div>
  );
};
