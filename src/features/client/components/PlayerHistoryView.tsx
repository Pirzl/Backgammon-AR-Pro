import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { ArrowLeft, Gamepad2, Trophy, Skull, Slash, Mail, CheckCircle2, XCircle } from 'lucide-react';

interface PlayerHistoryViewProps {
  currentUserId: string;
  opponentId: string;
  opponentName: string;
  onBack: () => void;
}

interface MatchRecord {
  id: string;
  played_at: string;
  winner: string; // 'white' | 'black'
  white_player_id: string;
  black_player_id: string;
  score_delta: number;
  type?: 'game' | 'invitation';
  status?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  sender_id?: string;
}

export const PlayerHistoryView: React.FC<PlayerHistoryViewProps> = ({
  currentUserId,
  opponentId,
  opponentName,
  onBack
}) => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ wins: 0, losses: 0 });

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        // Fetch games where both users participated (one as white, one as black)
        const { data, error } = await supabase
          .from('game_logs')
          .select('*')
          .or(`and(white_player_id.eq.${currentUserId},black_player_id.eq.${opponentId}),and(white_player_id.eq.${opponentId},black_player_id.eq.${currentUserId})`)
          .order('played_at', { ascending: false });

        if (error) throw error;
        
        const history: MatchRecord[] = data || [];
        setMatches(history);

        // Calculate stats
        let wins = 0;
        let losses = 0;
        history.forEach(game => {
            const isWhite = game.white_player_id === currentUserId;
            // Determine success based on winner color enum
            // Assuming game.winner contains 'white' or 'black'
            // or we check score_delta > 0 if structure is different. 
            // Based on previous files, winner seems to be color string.
            const userWon = (isWhite && game.winner === 'white') || (!isWhite && game.winner === 'black');
            if (userWon) wins++; else losses++;
        });
        setStats({ wins, losses });

      } catch (err) {
        console.error('Error fetching player history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [currentUserId, opponentId]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 hover:text-primary"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Vs. {opponentName}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Historial Cara a Cara</p>
        </div>
      </div>

      <div className="p-6">
        {/* Head-to-Head Stats Banner */}
        <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 flex flex-col items-center justify-center">
                <Trophy size={24} className="text-emerald-500 mb-2"/>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.wins}</span>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Victorias</span>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                <Gamepad2 size={24} className="text-slate-400 mb-2"/>
                <span className="text-2xl font-bold text-slate-700 dark:text-slate-300">{matches.length}</span>
                <span className="text-xs font-bold text-slate-500 uppercase">Total</span>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-100 dark:border-rose-800 flex flex-col items-center justify-center">
                <Skull size={24} className="text-rose-500 mb-2"/>
                <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.losses}</span>
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase">Derrotas</span>
            </div>
        </div>

        {loading ? (
             <div className="text-center py-12 text-slate-400">Cargando partidas...</div>
        ) : matches.length === 0 ? (
             <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                 <p className="text-slate-500 dark:text-slate-400 font-medium">Aún no hay interacciones registradas.</p>
                 <p className="text-sm text-slate-400 mt-1">¡Invítale a una partida para empezar vuestra rivalidad!</p>
             </div>
        ) : (
            <div className="space-y-3">
                {matches.map(match => {
                    if (match.type === 'game') {
                        const isWhite = match.white_player_id === currentUserId;
                        const isWinner = (isWhite && match.winner === 'white') || (!isWhite && match.winner === 'black');
                        
                        return (
                            <div key={match.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700 hover:border-primary/30 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-full text-slate-500">
                                        <Gamepad2 size={16} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                                            {new Date(match.played_at).toLocaleDateString()} {new Date(match.played_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                        <span className="text-xs text-slate-500">Partida Completada</span>
                                    </div>
                                </div>
                                
                                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                    isWinner 
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                }`}>
                                    {isWinner ? 'Victoria' : 'Derrota'}
                                </div>
                                
                                <div className="font-mono text-sm text-slate-500 min-w[60px] text-right">
                                    {(match.score_delta ?? 0) > 0 ? `+${match.score_delta}` : match.score_delta} pts
                                </div>
                            </div>
                        );
                    } else {
                        // Invitation record
                        const isSender = match.sender_id === currentUserId;
                        let statusConfig = { icon: <Slash size={16} />, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', label: 'Desconocido' };
                        
                        switch(match.status) {
                            case 'pending':
                                statusConfig = { icon: <Mail size={16} />, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'Pendiente' };
                                break;
                            case 'accepted':
                                statusConfig = { icon: <CheckCircle2 size={16} />, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30', label: 'Aceptada' };
                                break;
                            case 'rejected':
                                statusConfig = { icon: <XCircle size={16} />, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-900/30', label: 'Rechazada' };
                                break;
                            case 'cancelled':
                                statusConfig = { icon: <Slash size={16} />, color: 'text-slate-500', bg: 'bg-slate-200 dark:bg-slate-700', label: 'Cancelada' };
                                break;
                        }

                        return (
                            <div key={`inv-${match.id}`} className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 opacity-80">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                                        {statusConfig.icon}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                                            {new Date(match.played_at).toLocaleDateString()} {new Date(match.played_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {isSender ? 'Enviaste una invitación' : 'Recibiste una invitación'}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className={`text-xs font-bold uppercase ${statusConfig.color}`}>
                                    {statusConfig.label}
                                </div>
                                
                                <div className="font-mono text-sm text-transparent min-w[60px] text-right select-none">
                                    +0 pts
                                </div>
                            </div>
                        );
                    }
                })}
            </div>
        )}
      </div>
    </div>
  );
};
