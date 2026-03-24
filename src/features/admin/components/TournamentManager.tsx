import React, { useState } from 'react';
import { Plus, Calendar, Users, Trophy, DollarSign, Info, Trash2, Power, PlayCircle, UserPlus, X, AlertTriangle } from 'lucide-react';
import type { Tournament, ClientData, TournamentFormat } from '../../../entities/tournament/types';

// Constants locally defined or imported from shared constants if they existed
const TOURNAMENT_FORMATS: TournamentFormat[] = ['Single Elimination', 'Swiss System', 'Round Robin', 'League', 'Best-of Series'];

interface TournamentManagerProps {
  tournaments: Tournament[];
  clients?: ClientData[]; 
  onCreateTournament: (t: Partial<Tournament>) => void;
  onArchiveTournament: (id: string) => void;
  onToggleStatus: (id: string, status: string) => void;
  onInviteUser?: (tournamentId: string, userId: string) => void;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({ 
    tournaments, 
    clients = [],
    onCreateTournament, 
    onArchiveTournament,
    onToggleStatus,
    onInviteUser
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedTournamentForInvite, setSelectedTournamentForInvite] = useState<string | null>(null);
  const [selectedUserToInvite, setSelectedUserToInvite] = useState('');
  const [inviteAllUsers, setInviteAllUsers] = useState(false);
  const [selectedUsersForInvite, setSelectedUsersForInvite] = useState<string[]>([]);
  
  // State for Delete Confirmation Modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // State for Toggle Status with Countdown
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    format: TOURNAMENT_FORMATS[0],
    buyIn: 10,
    prizePool: 100,
    maxPlayers: 32, 
    startDate: '',
    isFree: false,
    seriesLength: 3,
    inviteStrategy: 'none', // 'none' | 'all' | 'specific'
    selectedInviteIds: [] as string[]
  });

  const handleBuyInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const buyIn = Number(e.target.value);
      // Auto-calculate Prize Pool (80% to players, 20% to House)
      const calculatedPrizePool = Math.floor((buyIn * formData.maxPlayers) * 0.8);
      
      setFormData({
          ...formData,
          buyIn,
          prizePool: calculatedPrizePool
      });
  };

  const handleMaxPlayersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const maxPlayers = Number(e.target.value);
      // Auto-calculate Prize Pool (80% to players, 20% to House)
      const calculatedPrizePool = Math.floor((formData.buyIn * maxPlayers) * 0.8);
      
      setFormData({
          ...formData,
          maxPlayers,
          prizePool: calculatedPrizePool
      });
  };

  const handleFreeToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
      const isFree = e.target.checked;
      setFormData({
          ...formData,
          isFree,
          buyIn: isFree ? 0 : 10,
          prizePool: isFree ? 0 : 100
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onCreateTournament({
      name: formData.name,
      format: formData.format as TournamentFormat,
      buyIn: Number(formData.buyIn),
      prizePool: Number(formData.prizePool),
      maxPlayers: Number(formData.maxPlayers),
      startDate: formData.startDate || new Date().toISOString(),
      seriesLength: formData.format === 'Best-of Series' ? Number(formData.seriesLength) : undefined,
      inviteStrategy: formData.inviteStrategy as 'none' | 'all' | 'specific'
    });

    setIsCreating(false);
    // Reset Form
    setFormData({
        name: '',
        format: TOURNAMENT_FORMATS[0],
        buyIn: 10,
        prizePool: 100,
        maxPlayers: 32,
        startDate: '',
        isFree: false,
        seriesLength: 3,
        inviteStrategy: 'none',
        selectedInviteIds: []
    });
  };

  const handleOpenInvite = (tId: string) => {
      setSelectedTournamentForInvite(tId);
      setInviteModalOpen(true);
      setSelectedUserToInvite('');
      setInviteAllUsers(false);
      setSelectedUsersForInvite([]);
  };

  const submitInvite = async () => {
      if (!selectedTournamentForInvite || !onInviteUser) return;
      
      try {
          if (inviteAllUsers) {
              // Invite all active users
              for (const client of clients.filter(c => c.status === 'active')) {
                  await onInviteUser(selectedTournamentForInvite, client.id);
              }
          } else if (selectedUsersForInvite.length > 0) {
              // Invite selected users
              for (const userId of selectedUsersForInvite) {
                  await onInviteUser(selectedTournamentForInvite, userId);
              }
          } else if (selectedUserToInvite) {
              // Single user invite (backward compatibility)
              await onInviteUser(selectedTournamentForInvite, selectedUserToInvite);
          }
          setInviteModalOpen(false);
          setSelectedUsersForInvite([]);
          setInviteAllUsers(false);
      } catch (error) {
          console.error('Error inviting users:', error);
          alert('Failed to invite users. Please try again.');
      }
  };
  
  const handleToggleUserSelection = (userId: string) => {
      setSelectedUsersForInvite(prev => 
          prev.includes(userId) 
              ? prev.filter(id => id !== userId)
              : [...prev, userId]
      );
  };
  
  const handleToggleStatus = async (tournamentId: string, currentStatus: string) => {
      setTogglingStatus(tournamentId);
      setCountdown(10);
      
      // Start countdown
      const interval = setInterval(() => {
          setCountdown(prev => {
              if (prev <= 1) {
                  clearInterval(interval);
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);
      
      try {
          await onToggleStatus(tournamentId, currentStatus);
          // Wait for countdown to finish
          setTimeout(() => {
              setTogglingStatus(null);
              setCountdown(0);
          }, 10000);
      } catch (error) {
          clearInterval(interval);
          setTogglingStatus(null);
          setCountdown(0);
          console.error('Error toggling status:', error);
          alert('Failed to toggle tournament status. Please try again.');
      }
  };

  const confirmDelete = () => {
      if (deleteConfirmId) {
          onArchiveTournament(deleteConfirmId);
          setDeleteConfirmId(null);
      }
  };

  // Only show active tournaments (hide archived)
  const visibleTournaments = tournaments.filter(t => t.status !== 'Archived');

  return (
    <div className="space-y-6 relative">
      
      {/* Invite Modal - Enhanced with All Users and Multi-Select */}
      {inviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-panel rounded-2xl shadow-2xl max-w-md w-full p-6 border border-border">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-foreground">Invite Players</h3>
                      <button onClick={() => setInviteModalOpen(false)}><X size={20} className="text-muted-foreground hover:text-foreground"/></button>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">Select players to invite to this tournament. They will receive a notification.</p>
                  
                  {/* All Users Checkbox */}
                  <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-blue-50 dark:bg-blue-900/10 mb-4 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors">
                      <input 
                          type="checkbox" 
                          checked={inviteAllUsers}
                          onChange={(e) => {
                              setInviteAllUsers(e.target.checked);
                              if (e.target.checked) {
                                  setSelectedUsersForInvite([]);
                                  setSelectedUserToInvite('');
                              }
                          }}
                          className="w-4 h-4"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Invite All Active Users ({clients.filter(c => c.status === 'active').length} users)
                      </span>
                  </label>
                  
                  {!inviteAllUsers && (
                      <>
                          <p className="text-xs text-slate-400 mb-2">Or select specific users:</p>
                          <div className="max-h-60 overflow-y-auto space-y-2 mb-4 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                              {clients.filter(c => c.status === 'active').map(c => (
                                  <label 
                                      key={c.id}
                                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                  >
                                      <input 
                                          type="checkbox"
                                          checked={selectedUsersForInvite.includes(c.id)}
                                          onChange={() => handleToggleUserSelection(c.id)}
                                          className="w-4 h-4"
                                      />
                                      <span className="text-sm text-slate-700 dark:text-slate-300">
                                          {c.firstName} {c.lastName} <span className="text-xs text-slate-400">({c.email})</span>
                                      </span>
                                  </label>
                              ))}
                          </div>
                      </>
                  )}

                  <button 
                    onClick={submitInvite}
                    disabled={!inviteAllUsers && selectedUsersForInvite.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      Send Invitation{inviteAllUsers ? 's to All' : selectedUsersForInvite.length > 1 ? `s (${selectedUsersForInvite.length})` : ''}
                  </button>
              </div>
          </div>
      )}

      {/* Delete/Archive Confirmation Modal */}
      {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-4 text-rose-600">
                      <AlertTriangle size={32} />
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">Archive Tournament?</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                      This will remove the tournament from the Active view but keep financial records for auditing. <br/><br/>
                      <strong>This action cannot be easily undone from the UI.</strong>
                  </p>
                  
                  <div className="flex gap-3">
                      <button 
                        onClick={() => setDeleteConfirmId(null)}
                        className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                        onClick={confirmDelete}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors"
                      >
                          Yes, Archive
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Active Tournaments</h3>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-md"
        >
          <Plus size={16} /> Create Tournament
        </button>
      </div>

      {/* Create Tournament Form */}
      {isCreating && (
        <div className="bg-panel p-8 rounded-xl border border-border shadow-lg">
          <h3 className="text-xl font-bold mb-6 text-foreground flex items-center gap-2">
              <Trophy className="text-primary" size={24} />
              New Tournament Wizard
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tournament Name */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Tournament Name</label>
              <input 
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-3 rounded-lg border border-border bg-muted text-sm focus:ring-2 focus:ring-primary/20 outline-none text-foreground"
                placeholder="e.g., Spring Championship 2024"
              />
            </div>

            {/* Competition Format */}
            <div>
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Competition Format</label>
               <select 
                 value={formData.format}
                 onChange={(e) => setFormData({...formData, format: e.target.value as TournamentFormat})}
                 className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
               >
                   {TOURNAMENT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
               </select>
               
               {/* Format Info Box */}
               <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg mt-3">
                   <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
                   <div className="flex-1">
                       <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-2">
                           {formData.format === 'Single Elimination' && 'Lose one match and you are out. Only winners advance. Fast and decisive.'}
                           {formData.format === 'Swiss System' && 'Non-elimination format. Players paired by similar skill/record each round. Fixed number of rounds.'}
                           {formData.format === 'Round Robin' && 'Every player plays every other player once. Most comprehensive format for fair ranking.'}
                           {formData.format === 'League' && 'Season-based format with cumulative points over time. Multiple matches per player.'}
                           {formData.format === 'Best-of Series' && 'Head-to-head match consisting of multiple games. First to win majority advances.'}
                       </p>
                       <div className="space-y-1">
                           {formData.format === 'Single Elimination' && (
                               <>
                                   <p className="text-xs text-emerald-600 font-medium">✓ Pros: Fast execution, exciting knockouts, clear bracket progression</p>
                                   <p className="text-xs text-rose-600 font-medium">⚠ Cons: One bad game eliminates you, luck-dependent, no second chances</p>
                               </>
                           )}
                           {formData.format === 'Swiss System' && (
                               <>
                                   <p className="text-xs text-emerald-600 font-medium">✓ Pros: Everyone plays same rounds, fair pairing, no elimination</p>
                                   <p className="text-xs text-rose-600 font-medium">⚠ Cons: Complex pairing algorithm, requires even player count, longer duration</p>
                               </>
                           )}
                           {formData.format === 'Round Robin' && (
                               <>
                                   <p className="text-xs text-emerald-600 font-medium">✓ Pros: Fairest format, everyone plays everyone, accurate final ranking</p>
                                   <p className="text-xs text-rose-600 font-medium">⚠ Cons: Very long duration, many matches (n×(n-1)/2), not scalable for large groups</p>
                               </>
                           )}
                           {formData.format === 'League' && (
                               <>
                                   <p className="text-xs text-emerald-600 font-medium">✓ Pros: Season-long engagement, comeback opportunities, cumulative scoring</p>
                                   <p className="text-xs text-rose-600 font-medium">⚠ Cons: Requires long-term commitment, players may drop out mid-season</p>
                               </>
                           )}
                           {formData.format === 'Best-of Series' && (
                               <>
                                   <p className="text-xs text-emerald-600 font-medium">✓ Pros: Reduces luck factor, rewards consistency, exciting comebacks possible</p>
                                   <p className="text-xs text-rose-600 font-medium">⚠ Cons: Longer per-match duration, may become one-sided if skill gap is large</p>
                               </>
                           )}
                       </div>
                   </div>
               </div>
            </div>

            {/* Best-of Series Length */}
            {formData.format === 'Best-of Series' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Series Length (Best of)</label>
                    <input 
                      type="number"
                      min="3"
                      max="9"
                      step="2"
                      value={formData.seriesLength}
                      onChange={(e) => setFormData({...formData, seriesLength: Number(e.target.value)})}
                      className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">Must be odd number (3, 5, 7, 9)</p>
                </div>
            )}

            {/* Start Date & Max Players */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Date</label>
                <input 
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max Players</label>
                  <input 
                  type="number"
                  min="2"
                  value={formData.maxPlayers}
                  onChange={handleMaxPlayersChange}
                  className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            {/* Practice Mode Toggle */}
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                <input 
                  type="checkbox"
                  id="practiceMode"
                  checked={formData.isFree}
                  onChange={handleFreeToggle}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-500"
                />
                <label htmlFor="practiceMode" className="flex-1 cursor-pointer">
                    <div className="font-medium text-slate-700 dark:text-slate-300">Practice Mode (Free Tournament)</div>
                    <div className="text-xs text-slate-500">No buy-in or prize pool. Great for testing or casual play.</div>
                </label>
            </div>

            {/* Buy-In & Prize Pool */}
            {!formData.isFree && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Buy-In (pts)</label>
                    <input 
                      type="number"
                      min="0"
                      step="1"
                      value={formData.buyIn}
                      onChange={handleBuyInChange}
                      className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Prize Pool (pts) - 80% Payout</label>
                    <input 
                      type="number"
                      min="0"
                      step="1"
                      value={formData.prizePool}
                      readOnly
                      className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none cursor-not-allowed opacity-80"
                    />
                  </div>
                </div>
            )}

            {/* Invitation Strategy */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Invitation Strategy</label>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <input 
                          type="radio"
                          name="inviteStrategy"
                          value="none"
                          checked={formData.inviteStrategy === 'none'}
                          onChange={(e) => setFormData({...formData, inviteStrategy: e.target.value})}
                          className="w-4 h-4"
                        />
                        <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Open Registration</div>
                            <div className="text-xs text-slate-500">Players can join on their own</div>
                        </div>
                    </label>
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <input 
                          type="radio"
                          name="inviteStrategy"
                          value="all"
                          checked={formData.inviteStrategy === 'all'}
                          onChange={(e) => setFormData({...formData, inviteStrategy: e.target.value})}
                          className="w-4 h-4"
                        />
                        <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Invite All Users</div>
                            <div className="text-xs text-slate-500">Send invitations to all active players</div>
                        </div>
                    </label>
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <input 
                          type="radio"
                          name="inviteStrategy"
                          value="specific"
                          checked={formData.inviteStrategy === 'specific'}
                          onChange={(e) => setFormData({...formData, inviteStrategy: e.target.value})}
                          className="w-4 h-4"
                        />
                        <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Invite Specific Users</div>
                            <div className="text-xs text-slate-500">Manually select players to invite</div>
                        </div>
                    </label>
                </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button 
                type="button" 
                onClick={() => setIsCreating(false)}
                className="px-6 py-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Launch Tournament
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleTournaments.map(t => (
          <div key={t.id} className={`bg-panel p-5 rounded-xl border shadow-sm hover:shadow-md transition-shadow relative group ${t.status === 'Cancelled' ? 'border-rose-200 dark:border-rose-900 opacity-75' : 'border-border'}`}>
            
            {/* Status and ID */}
            <div className="flex justify-between items-start mb-3">
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${
                  t.status === 'Open' ? 'bg-emerald-100 text-emerald-700' : 
                  t.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' :
                  'bg-muted text-muted-foreground'
              }`}>
                {t.status === 'Cancelled' ? 'Disabled' : t.status}
              </span>
              <span className="text-xs text-muted-foreground font-mono">ID: {t.id.slice(0,8)}</span>
            </div>
            
            <h4 className="font-bold text-foreground mb-1">{t.name}</h4>
            <div className="text-xs text-slate-500 mb-4 flex items-center gap-1">
              <Calendar size={12} /> {new Date(t.startDate).toLocaleString()}
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Users size={10}/> Players</div>
                <div className="font-medium text-slate-700 dark:text-slate-200">{t.currentPlayers} / {t.maxPlayers}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><DollarSign size={10}/> Buy-In</div>
                <div className="font-medium text-slate-700 dark:text-slate-200">
                    {t.buyIn === 0 ? <span className="text-emerald-600 font-bold uppercase text-xs">Free</span> : `$${t.buyIn}`}
                </div>
              </div>
              <div className="col-span-2 bg-yellow-50 dark:bg-yellow-900/10 p-2 rounded-lg border border-yellow-100 dark:border-yellow-900/30">
                <div className="text-xs text-yellow-600 dark:text-yellow-500 mb-1 flex items-center gap-1"><Trophy size={10}/> Prize Pool</div>
                <div className="font-bold text-yellow-700 dark:text-yellow-400">
                    {t.prizePool === 0 ? 'Bragging Rights Only' : `$${t.prizePool}`}
                </div>
              </div>
            </div>

            {/* Admin Controls */}
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {t.status === 'Open' && (
                    <button 
                        onClick={() => handleOpenInvite(t.id)}
                        className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                        title="Invite Player"
                    >
                        <UserPlus size={16} />
                    </button>
                )}

                {/* Status Toggle Button (Enable/Disable) with Countdown */}
                {togglingStatus === t.id ? (
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold text-xs flex items-center justify-center min-w-[32px]">
                        {countdown}s
                    </div>
                ) : t.status === 'Cancelled' ? (
                     <button 
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors"
                        title="Enable Tournament (Open)"
                     >
                        <PlayCircle size={16} />
                     </button>
                ) : (
                    <button 
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        title="Disable Tournament (Cancel)"
                     >
                        <Power size={16} />
                     </button>
                )}
                
                {/* Delete/Archive Button - Triggers Custom Modal */}
                <button 
                    onClick={() => setDeleteConfirmId(t.id)}
                    className="p-1.5 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-colors"
                    title="Archive (Soft Delete)"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Format Badge */}
            <div className="mt-3 text-[10px] text-slate-400 uppercase font-bold tracking-widest text-center border-t border-slate-100 dark:border-slate-700 pt-2">
                Format: {t.format} {t.seriesLength ? `(Best of ${t.seriesLength})` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
