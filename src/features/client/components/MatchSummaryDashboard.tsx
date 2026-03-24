import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { Search, Trophy, TrendingUp, TrendingDown } from 'lucide-react';

interface MatchSummary {
  opponentId: string;
  opponentName: string; // "AI Grandmaster" or human name
  gamesPlayed: number;
  wins: number;
  losses: number;
  lastPlayed: string;
}

interface MatchSummaryDashboardProps {
  currentUserId: string;
}

export const MatchSummaryDashboard: React.FC<MatchSummaryDashboardProps> = ({ currentUserId }) => {
  const [summary, setSummary] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!currentUserId) return;

    const fetchMatchHistory = async () => {
        setLoading(true);
        try {
            // Fetch All Games involving current user
            // Fetch All Games (2-step fetch to avoid join errors)
            const { data: gamesRaw, error } = await supabase
                .from('game_logs')
                .select(`
                    winner, 
                    white_player_id, 
                    black_player_id, 
                    played_at
                `)
                .or(`white_player_id.eq.${currentUserId},black_player_id.eq.${currentUserId}`)
                .order('played_at', { ascending: false });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let games: any[] = [];

            if (gamesRaw) {
                const playerIds = Array.from(new Set(gamesRaw.flatMap(g => [g.white_player_id, g.black_player_id]).filter(Boolean)));
                
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name, email')
                    .in('id', playerIds);

                if (profiles) {
                    const profileMap = new Map(profiles.map(p => [p.id, p]));
                    games = gamesRaw.map(g => ({
                        ...g,
                        white_player: profileMap.get(g.white_player_id),
                        black_player: profileMap.get(g.black_player_id)
                    }));
                } else {
                    games = gamesRaw;
                }
            }

            if (error) throw error;

            if (games) {
                const statsMap: Record<string, MatchSummary> = {};

                games.forEach(game => {
                    const isWhite = game.white_player_id === currentUserId;
                    
                    // Identify Opponent
                    let opponentId = 'ai';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let opponentData: any = null;

                    if (isWhite) {
                        opponentId = game.black_player_id || 'ai';
                        opponentData = game.black_player;
                    } else {
                        opponentId = game.white_player_id || 'ai';
                        opponentData = game.white_player;
                    }

                    if (opponentId === 'ai') {
                         opponentData = { first_name: 'IA', last_name: 'Grandmaster' };
                    }

                    let stats = statsMap[opponentId];
                    if (!stats) {
                        stats = {
                            opponentId,
                            opponentName: opponentData ? `${opponentData.first_name || ''} ${opponentData.last_name || ''}`.trim() || 'Desconocido' : 'Desconocido',
                            gamesPlayed: 0,
                            wins: 0,
                            losses: 0,
                            lastPlayed: game.played_at
                        };
                        statsMap[opponentId] = stats;
                    }

                    stats.gamesPlayed++;
                    const userWon = (isWhite && game.winner === 'white') || (!isWhite && game.winner === 'black');
                    if (userWon) stats.wins++;
                    else stats.losses++;

                    // Keep most recent date
                    if (new Date(game.played_at) > new Date(stats.lastPlayed)) {
                        stats.lastPlayed = game.played_at;
                    }
                });

                setSummary(Object.values(statsMap).sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime()));
            }
        } catch (err) {
            console.error("Error fetching match history:", err);
        } finally {
            setLoading(false);
        }
    };

    fetchMatchHistory();
  }, [currentUserId]);

  const filteredSummary = summary.filter(item => 
    item.opponentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in duration-500 mt-6">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Trophy className="text-amber-500" size={20} />
                    Rendimiento por Oponente
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs">Resumen histórico de tus enfrentamientos</p>
            </div>
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar oponente..." 
                  className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider sticky top-0 z-10">
                        <th className="p-4 bg-slate-50 dark:bg-slate-900">Oponente</th>
                        <th className="p-4 text-center bg-slate-50 dark:bg-slate-900">Total</th>
                        <th className="p-4 text-center bg-slate-50 dark:bg-slate-900 text-emerald-500">Victorias</th>
                        <th className="p-4 text-center bg-slate-50 dark:bg-slate-900 text-rose-500">Derrotas</th>
                        <th className="p-4 text-center bg-slate-50 dark:bg-slate-900">Win Rate</th>
                        <th className="p-4 text-right bg-slate-50 dark:bg-slate-900">Última Partida</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {loading ? (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">Espere... Cargando estadísticas...</td>
                        </tr>
                    ) : filteredSummary.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">No hay partidas registradas.</td>
                        </tr>
                    ) : filteredSummary.map((stat) => {
                        const winRate = stat.gamesPlayed > 0 ? Math.round((stat.wins / stat.gamesPlayed) * 100) : 0;
                        
                        return (
                            <tr key={stat.opponentId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="p-4 font-medium text-slate-900 dark:text-white">
                                    {stat.opponentName}
                                    {stat.opponentId === 'ai' && <span className="ml-2 text-[10px] bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded">BOT</span>}
                                </td>
                                <td className="p-4 text-center font-bold">{stat.gamesPlayed}</td>
                                <td className="p-4 text-center text-emerald-600 dark:text-emerald-400 font-bold">{stat.wins}</td>
                                <td className="p-4 text-center text-rose-600 dark:text-rose-400 font-bold">{stat.losses}</td>
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className={`text-sm font-bold ${winRate >= 50 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {winRate}%
                                        </span>
                                        {winRate >= 50 ? <TrendingUp size={14} className="text-emerald-500" /> : <TrendingDown size={14} className="text-amber-500" />}
                                    </div>
                                </td>
                                <td className="p-4 text-right text-xs text-slate-500">
                                    {new Date(stat.lastPlayed).toLocaleDateString()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};
