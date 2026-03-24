// e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO/src/features/ranking/api.ts

import { supabase } from '../../shared/api/supabase';
import { calculateNewRank, type RankResult } from './rankCalculator';

export async function updatePlayerRank(playerId: string): Promise<void> {
  if (!playerId) return;

  try {
    // 1. Fetch last 30 games for the player
    const { data: games, error: historyError } = await supabase
      .from('game_logs')
      .select('*')
      .or(`white_player_id.eq.${playerId},black_player_id.eq.${playerId}`)
      .order('played_at', { ascending: false })
      .limit(30);

    if (historyError) {
      console.error('Failed to fetch history for rank update:', historyError);
      return;
    }

    if (!games) return;

    // 2. Map to format needed for calculator
    const simpleGames = games.map(g => {
       const isWhite = g.white_player_id === playerId;
       const winnerColor = g.winner || g.winner_color;
       const isWin = (isWhite && winnerColor === 'white') || (!isWhite && winnerColor === 'black');
       return {
           isWin,
           playedAt: g.played_at
       };
    });

    // 3. Calculate New Rank
    const result: RankResult = calculateNewRank(simpleGames);

    console.log(`Updating rank for ${playerId}:`, result.newRank.name);

    // 4. Update Profile (Soft fail if columns don't exist yet)
    // We check if we can update.
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        rank_current: result.newRank.id, // Store ID (e.g. 'principiante'), UI maps to Name
        // rank_highest? We need to fetch current first to check if higher. 
        // For now just update current.
        current_streak: calculateStreak(simpleGames), 
        ranking_metadata: {
            winsIn30: result.winsIn30,
            totalEvaluated: result.totalGamesEvaluated,
            lastUpdate: new Date().toISOString()
        }
      })
      .eq('id', playerId);

    if (updateError) {
       console.warn('Could not update player rank in DB (Columns might be missing):', updateError.message);
    }
  } catch (err) {
      console.error('Unexpected error in updatePlayerRank:', err);
  }
}

function calculateStreak(games: {isWin: boolean}[]): number {
    if (games.length === 0) return 0;
    const sorted = [...games]; // Already sorted desc in fetch? Yes.
    // games[0] is most recent.
    
    let streak = 0; // Initialize streak here
    if (!sorted[0]) return 0; // This check makes sorted[0] safe
    const isWinStreak = sorted[0].isWin; // No optional chaining needed here due to the check above
    
    for (const game of sorted) {
        if (game.isWin === isWinStreak) {
            streak++;
        } else {
            break;
        }
    }
    
    return isWinStreak ? streak : -streak;
}
