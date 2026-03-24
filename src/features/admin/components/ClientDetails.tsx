import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { supabase } from '../../../shared/api/supabase';
import { RankBadge } from '../../ranking/components/RankBadge';
import { calculateNewRank } from '../../ranking/rankCalculator';
import { AdminCalibrationView } from './AdminCalibrationView';
import type { ClientData } from '../../../entities/tournament/types';

interface GameLog {
  id: string;
  played_at: string;
  white_player_id?: string;
  black_player_id?: string;
  winner_id?: string;
  winner?: string; // Add this
  winner_color?: string; // Add this
  tournament_id: string | null;
  white_player_name?: string; // Joined or fetched
  black_player_name?: string;
}

interface ClientDetailsProps {
  clientId: string;
  onBack: () => void;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ clientId, onBack }) => {
  const [client, setClient] = useState<ClientData | null>(null);
  const [games, setGames] = useState<GameLog[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftAmount, setGiftAmount] = useState(100);
  const [isGifting, setIsGifting] = useState(false);

  const fetchClientData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*, wallets!user_id(saldo_actual)')
        .eq('id', clientId)
        .single();
        
      if (profileError) throw profileError;

      // Map to ClientData (partial)
      const clientData: ClientData = {
        id: profile.id,
        firstName: profile.username || 'Unknown',
        lastName: '',
        email: profile.email || '',
        phone: '',
        avatar: profile.avatar_url,
        role: profile.role || 'user',
        status: profile.status || 'active',
        joinedDate: profile.created_at,
        kycStatus: profile.kyc_status || 'none',
        skillRating: profile.skill_rating || 0,
        walletBalance: (Array.isArray(profile.wallets) ? profile.wallets[0]?.saldo_actual : profile.wallets?.saldo_actual) ?? profile.wallet_balance ?? 500,
        stats: {
          tournamentsPlayed: 0,
          tournamentsWon: 0,
          totalEntryFees: 0,
          totalPrizeMoney: 0,
          netResults: 0
        },
        history: [],
        messages: [],
        internalNotes: profile.internal_notes,
        clientNotes: profile.client_notes
      };
      setClient(clientData);

      // 2. Fetch Game Activity
      const { data: gameLogs, error: gameError } = await supabase
        .from('game_logs')
        .select('*')
        .or(`white_player_id.eq.${clientId},black_player_id.eq.${clientId}`)
        .order('played_at', { ascending: false })
        .limit(50);

      if (gameError) throw gameError;

      setGames(gameLogs || []);

      setPoints((Array.isArray(profile.wallets) ? profile.wallets[0]?.saldo_actual : profile.wallets?.saldo_actual) ?? profile.wallet_balance ?? 500);

    } catch (err) {
      console.error('Error fetching client details:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const handleGiftPoints = async () => {
    if (!client || giftAmount <= 0) return;
    try {
        setIsGifting(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        
        const { error } = await supabase.rpc('admin_gift_points', {
            p_admin_id: session.user.id,
            p_target_user_id: client.id,
            p_amount: giftAmount
        });

        if (error) throw error;
        
        alert(`¡Se han regalado ${giftAmount} puntos exitosamente!`);
        setShowGiftModal(false);
        fetchClientData(); // Refresh data
    } catch (err) {
        console.error('Error gifting points:', err);
        alert('Error al regalar puntos. Asegúrate de tener permisos de administrador.');
    } finally {
        setIsGifting(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!client) return;
    const newStatus = client.status === 'blocked' ? 'active' : 'blocked';
    const actionName = newStatus === 'blocked' ? 'bloquear' : 'desbloquear';
    
    if (!window.confirm(`¿Estás seguro de que deseas ${actionName} a este usuario?`)) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { error } = await supabase.rpc('admin_toggle_user_status', {
            p_admin_id: session.user.id,
            p_target_user_id: client.id,
            p_new_status: newStatus
        });

        if (error) throw error;
        
        alert(`Usuario ${actionName}do exitosamente.`);
        fetchClientData();
    } catch (err) {
        console.error('Error toggling block status:', err);
        alert('Error al modificar el estado. Asegúrate de tener permisos de administrador.');
    }
  };

  const handleDeleteUser = async () => {
    if (!client) return;
    const confirmName = window.prompt(`¿Estás 100% seguro de que deseas ELIMINAR a este usuario y todos sus datos?\nEsta acción es irreversible.\nEscribe "ELIMINAR" para confirmar:`);
    
    if (confirmName !== 'ELIMINAR') return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { error } = await supabase.rpc('admin_delete_user', {
            p_admin_id: session.user.id,
            p_target_user_id: client.id
        });

        if (error) throw error;
        
        alert('Usuario eliminado exitosamente.');
        onBack(); // Go back to directory list
    } catch (err) {
        console.error('Error deleting user:', err);
        alert('Error al eliminar usuario. Asegúrate de tener permisos de administrador.');
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Loading player details...</div>;
  }

  if (!client) {
    return <div className="p-12 text-center text-rose-500">Player not found</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft className="text-slate-500" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {client.firstName} {client.lastName}
            </h2>
            <p className="text-slate-500 text-sm">Player ID: {client.id}</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowGiftModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-colors"
        >
          Regalar Puntos
        </button>
      </div>

      {showGiftModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-indigo-500/50 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Regalar Puntos a {client.firstName}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cantidad de Puntos</label>
              <input 
                type="number" 
                min="1"
                value={giftAmount}
                onChange={(e) => setGiftAmount(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowGiftModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                disabled={isGifting}
              >
                Cancelar
              </button>
              <button 
                onClick={handleGiftPoints}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                disabled={isGifting}
              >
                {isGifting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 mb-1">Points</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {(points ?? 500).toLocaleString()} pts
          </div>
          <div className="text-xs text-slate-400 mt-1">Saldo actual</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 mb-1">Total Games</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{games.length}</div>
        </div>
        
        {/* Wins / Losses Breakdown */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 mb-1">Results</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{games.filter(g => {
                const isWhite = g.white_player_id === client.id;
                const winnerColor = g.winner || g.winner_color;
                return (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
            }).length}W</span>
            <span className="text-slate-400">/</span>
            <span className="text-2xl font-bold text-rose-600">{games.filter(g => {
                const isWhite = g.white_player_id === client.id;
                const winnerColor = g.winner || g.winner_color;
                return !((isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black'));
            }).length}L</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 mb-1">Win Rate</div>
          <div className="text-2xl font-bold text-emerald-600">
            {games.length > 0 
              ? Math.round((games.filter(g => {
                const isWhite = g.white_player_id === client.id;
                const winnerColor = g.winner || g.winner_color;
                return (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
              }).length / games.length) * 100) 
              : 0}%
          </div>
        </div>
            {/* Skill Rating / Rank Card */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              {(() => {
                 const rankResult = calculateNewRank(games.map(g => ({
                     isWin: (g.white_player_id === client.id && (g.winner === 'white' || g.winner_color === 'white')) || 
                            (g.black_player_id === client.id && (g.winner === 'black' || g.winner_color === 'black')),
                     playedAt: g.played_at
                 })));
                 const currentRank = rankResult.newRank;
                 return (
                     <div className="flex items-center gap-3">
                         <RankBadge rankId={currentRank.id} size="lg" />
                         <div>
                             <div className="text-sm text-slate-500 mb-1">Rank & Rating</div>
                             <div className="text-xl font-bold text-slate-900 dark:text-white flex items-baseline gap-2">
                                 {currentRank.name}
                                 <span className="text-sm text-slate-400 font-normal">
                                    ({client.skillRating === 1200 && games.length < 5 ? 0 : client.skillRating} ELO)
                                 </span>
                             </div>
                             <div className="text-xs text-slate-400">{rankResult.winsIn30}/30 Wins (Window)</div>
                         </div>
                     </div>
                 );
              })()}
            </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 mb-1">KYC Status</div>
          <div className={`text-lg font-bold uppercase ${
            client.kycStatus === 'verified' ? 'text-emerald-500' : 'text-amber-500'
          }`}>
            {client.kycStatus}
          </div>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock size={18} className="text-slate-400" />
            Recent Activity
          </h3>
        </div>
        
        {games.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 font-medium">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Opponent</th>
                <th className="p-3">Result</th>
                <th className="p-3 font-mono text-xs">Game ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {games.map(game => {
                const isWhite = game.white_player_id === client.id;
                const winnerColor = game.winner || game.winner_color; // Handle both fields if inconsistent
                const isWinner = (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
                const opponentId = isWhite ? game.black_player_id : game.white_player_id;
                
                return (
                  <tr key={game.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {new Date(game.played_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-slate-900 dark:text-white font-medium">
                      Opponent: <span className="text-slate-400">
                        {(!opponentId || opponentId.length < 10) ? 'AI' : <span className="font-mono text-xs">{opponentId.slice(0, 8)}...</span>}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                        isWinner 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                      }`}>
                        {isWinner ? 'Won' : 'Lost'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-400">
                      {game.id.split('-')[0]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-slate-500">
            No recent game activity found.
          </div>
        )}
      </div>

      {/* Hand Tracking Calibration Info */}
      <AdminCalibrationView userId={client.id} />

      {/* Risk Management / Danger Zone */}
      <div className="bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/50 p-6 mt-8">
        <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400 mb-4 flex items-center gap-2">
          Gestión de Riesgo
        </h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleToggleBlock}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all ${
              client.status === 'blocked'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {client.status === 'blocked' ? 'Desbloquear Usuario' : 'Bloquear Usuario'}
          </button>
          <button
            onClick={handleDeleteUser}
            className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-all"
          >
            Eliminar Cuenta
          </button>
        </div>
      </div>
    </div>
  );
};
