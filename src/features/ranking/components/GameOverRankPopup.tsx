// e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO/src/features/ranking/components/GameOverRankPopup.tsx

import React, { useEffect, useState } from 'react';
import { RotateCcw, Home } from 'lucide-react';
import { supabase } from '../../../shared/api/supabase';
import { RankBadge } from './RankBadge';
import { calculateNewRank } from '../rankCalculator';
import { RANKS, type RankDefinition } from '../constants';

interface GameOverRankPopupProps {
  winner: 'white' | 'black';
  myColor: 'white' | 'black' | null; // null if spectator or not logged in
  onPlayAgain: () => void;
  onExit: () => void;
}

export const GameOverRankPopup: React.FC<GameOverRankPopupProps> = ({
  winner,
  myColor,
  onPlayAgain,
  onExit
}) => {
  const [rankData, setRankData] = useState<{
    currentRank: RankDefinition | null;
    winsIn30: number;
    loading: boolean;
    isAnonymous: boolean;
  }>({ currentRank: null, winsIn30: 0, loading: true, isAnonymous: false });

  // If myColor is null, we assume they are a guest player (white) if logic dictates, 
  // OR we need to know if they are actually spectating.
  // For this app context (P v AI), user is always playing White.
  // So if myColor is null, it means Anonymous Player (White).
  // Let's treat "Spectator" as "Anonymous" for now to show the fun messages to everyone.
  const isWinner = (myColor === winner) || (myColor === null && winner === 'white'); 

  useEffect(() => {
    async function fetchRank() {
      // 1. Check User Session
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
         // ANONYMOUS / GUEST MODE
         // Show ironic message from lowest rank (or random) but NO rank data
         setRankData({ 
            currentRank: RANKS[0] || null, // Use "Principiante" (or similar) as base for messages
            winsIn30: 0, 
            loading: false,
            isAnonymous: true
         });
         return;
      }
      
      // 2. REGISTERED USER FETCH (Existing Logic)
      try {
        const { data: games } = await supabase
          .from('game_logs')
          .select('*')
          .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
          .order('played_at', { ascending: false })
          .limit(30);
          
        const simpleGames = (games || []).map(g => ({
             isWin: (g.white_player_id === user.id && (g.winner === 'white' || g.winner_color === 'white')) || 
                    (g.black_player_id === user.id && (g.winner === 'black' || g.winner_color === 'black')),
             playedAt: g.played_at
        }));
        
        const result = calculateNewRank(simpleGames);
        setRankData({ 
            currentRank: result.newRank, 
            winsIn30: result.winsIn30,
            loading: false,
            isAnonymous: false
        });

      } catch (e) {
        console.error("Rank fetch error", e);
        // Fallback
        setRankData({ currentRank: RANKS[0]!, winsIn30: 0, loading: false, isAnonymous: false });
      }
    }
    
    fetchRank();
  }, [winner, myColor]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
       <div className="flex flex-col items-center gap-6 p-8 md:p-12 bg-zinc-900 border border-slate-700/50 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden max-w-lg w-full">
           
           {/* Background Glow */}
           <div className={`absolute inset-0 opacity-20 pointer-events-none ${isWinner ? 'bg-gradient-to-b from-emerald-500/30 to-transparent' : 'bg-gradient-to-b from-rose-500/30 to-transparent'}`} />
           
           <div className="relative z-10 flex flex-col items-center text-center">
               <h2 className={`text-4xl md:text-5xl font-black uppercase tracking-widest mb-2 ${isWinner ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' : 'text-rose-500'}`}>
                   {isWinner ? 'VICTORIA' : 'DERROTA'}
               </h2>
               
               <p className="text-slate-400 text-sm font-medium tracking-widest uppercase mb-8">
                   PARTIDA FINALIZADA
               </p>

               {/* Rank/Message Display */}
               {rankData.loading ? (
                   <div className="h-32 flex items-center justify-center"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
               ) : (
                   <div className="flex flex-col items-center animate-in zoom-in duration-500 delay-150">
                       
                       {/* Show Rank Badge ONLY if Registered */}
                       {!rankData.isAnonymous && (
                           <div className="relative mb-4">
                               <div className={`absolute inset-0 blur-xl opacity-50 ${rankData.currentRank?.badgeColor?.replace('text-', 'bg-') || 'bg-slate-500'}`}></div>
                               <RankBadge rankId={rankData.currentRank?.id || 'principiante'} size="xl" showAnimation={true} className="relative z-10 shadow-xl" />
                           </div>
                       )}

                       {/* Show Message for EVERYONE (Anonymous and Registered) */}
                       <div className="px-4 py-4 bg-black/30 rounded-lg border border-white/5 mb-6 max-w-xs transition-all hover:bg-black/40">
                           <p className="text-lg text-slate-200 italic font-medium leading-relaxed">
                               "{rankData.currentRank?.message}"
                           </p>
                       </div>
                       
                       {/* Show Stats ONLY if Registered */}
                       {!rankData.isAnonymous && (
                           <>
                               <h3 className="text-2xl font-bold text-white mb-2">{rankData.currentRank?.name}</h3>
                               <div className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-8">
                                   Racha: {rankData.winsIn30}/30 en ventana
                               </div>
                           </>
                       )}
                       
                       {/* Guest Call to Action */}
                       {rankData.isAnonymous && (
                           <div className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-8 animate-pulse">
                               Regístrate para ver tu Rango
                           </div>
                       )}
                   </div>
               )}

               <div className="flex flex-col md:flex-row gap-4 w-full">
                   <button 
                     onClick={onPlayAgain}
                     className="flex-1 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg hover:shadow-cyan-500/50 flex items-center justify-center gap-2"
                   >
                     <RotateCcw size={20} /> Nueva Partida
                   </button>
                   <button 
                     onClick={onExit}
                     className="px-6 py-4 bg-zinc-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
                   >
                     <Home size={20} /> Salir
                   </button>
               </div>
           </div>
       </div>
    </div>
  );
};
