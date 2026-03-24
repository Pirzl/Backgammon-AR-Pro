import React, { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { Trophy, Database, Flame, Medal } from 'lucide-react';

interface LeaderboardData {
  topPoints: { name: string; points: number }[];
  topStreaks: { name: string; streak: number }[];
}

const DEFAULT_DATA: LeaderboardData = {
  topPoints: [],
  topStreaks: []
};

export const KingOfTheHill: React.FC = () => {
  const [data, setData] = useState<LeaderboardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const { data: result, error } = await supabase.rpc('get_king_of_the_hill');
        if (error) throw error;
        
        // The RPC returns an array with one row, extract the fields
        if (result && result.length > 0) {
          const row = result[0];
          setData({
            topPoints: row.top_points || [],
            topStreaks: row.top_streaks || []
          });
        }
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
        // Set empty data on error to prevent crash
        setData({ topPoints: [], topStreaks: [] });
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeaderboard();
    
    // Subscribe to profile changes to refresh leaderboard in realtime (Balance, Streaks)
    const channel = supabase
      .channel('leaderboard-refresh')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchLeaderboard();
        }
      )
      .subscribe();

    // Refresh every 5 minutes automatically (fallback)
    const interval = setInterval(fetchLeaderboard, 300000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-48 bg-panel rounded-xl border border-border flex items-center justify-center animate-pulse">
        <div className="text-muted-foreground flex items-center gap-2">
          <Trophy className="animate-bounce text-amber-500" />
          Cargando Tabla de Clasificación...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-panel rounded-xl border border-border shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-500 mb-6">
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-4 border-b border-amber-700">
        <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Medal className="text-yellow-300" />
          Rey de la Colina
        </h2>
        <p className="text-amber-100 text-sm opacity-90">Los mejores jugadores del momento</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-px bg-border">
        {/* Points Leaderboard */}
        <div className="bg-panel p-5">
          <h3 className="text-md font-bold text-foreground mb-4 flex items-center gap-2">
            <Database className="text-blue-500" size={18} /> 
            Más Ricos (Pts)
          </h3>
          <div className="space-y-3">
            {(!data.topPoints || data.topPoints.length === 0) ? (
              <p className="text-sm text-muted-foreground italic">Nadie tiene puntos aún.</p>
            ) : (
              data.topPoints.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border/50 hover:bg-muted/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`font-black text-lg ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                      #{i + 1}
                    </span>
                    <span className="font-semibold text-foreground">{p.name || 'Anónimo'}</span>
                  </div>
                  <span className="font-bold text-cyan-400">{p.points.toLocaleString()} pts</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Streaks Leaderboard */}
        <div className="bg-panel p-5">
          <h3 className="text-md font-bold text-foreground mb-4 flex items-center gap-2">
            <Flame className="text-rose-500" size={18} /> 
            Racha vs IA (Mejores)
          </h3>
          <div className="space-y-3">
            {(!data.topStreaks || data.topStreaks.length === 0) ? (
              <p className="text-sm text-muted-foreground italic">Nadie ha vencido a la IA aún.</p>
            ) : (
              data.topStreaks.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border/50 hover:bg-muted/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`font-black text-lg ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                      #{i + 1}
                    </span>
                    <span className="font-semibold text-foreground">{s.name || 'Anónimo'}</span>
                  </div>
                  <span className="font-bold text-rose-400 flex items-center gap-1">
                    {s.streak} <Flame size={14} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
