// e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO/src/features/ranking/rankCalculator.ts

import { RANKS, STREAK_TIERS, FALLING_RANKS, type RankDefinition } from './constants';

interface SimpleGameResult {
  isWin: boolean;
  playedAt: string; // ISO date
}

export interface RankResult {
  newRank: RankDefinition;
  winsIn30: number;
  totalGamesEvaluated: number;
  nextTierProgress?: {
    winsNeeded: number;
    windowSize: number;
    currentWinsInWindow: number;
    targetRankName: string;
  };
}

export function calculateNewRank(completedGames: SimpleGameResult[]): RankResult {
  // 1. Sort games by date desc (just in case)
  const sortedGames = [...completedGames].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  
  // 2. Take last 30
  const last30 = sortedGames.slice(0, 30);
  
  // 3. Count basic wins
  const winsIn30 = last30.filter(g => g.isWin).length;
  
  // 4. Determine Rank based on Tiers
  let highestQualifiedTierIndex = -1;

  // We check tiers from hardest (last) to easiest (first) OR iterate up.
  // The user requirement: "If player meets or exceeds the ratio -> Rank Up"
  // "The system must always evaluate the last 30 games, using the streak tiers"
  // The tiers have different window sizes (e.g. 20/30, 1/2).
  // We need to check if the *recent games within that window* meet the criteria.
  
  for (let i = 0; i < STREAK_TIERS.length; i++) {
    const tier = STREAK_TIERS[i];
    if (!tier) continue;
    // Get the window of games for this tier (e.g. last 5 games)
    const gamesInWindow = sortedGames.slice(0, tier.gamesWindow);
    
    // If not enough games played to evaluate this tier, skip or fail? 
    // Usually if you haven't played 30 games, you can't be a God.
    if (gamesInWindow.length < tier.gamesWindow) {
        continue;
    }

    const winsInWindow = gamesInWindow.filter(g => g.isWin).length;
    
    if (winsInWindow >= tier.winsNeeded) {
      highestQualifiedTierIndex = i;
    }
  }
  
  // 5. Determine Rank from Tier
  let newRank: RankDefinition;
  
  if (highestQualifiedTierIndex !== -1) {
    const tier = STREAK_TIERS[highestQualifiedTierIndex];
    if (tier) {
        const foundRank = RANKS[tier.minRankOrder];
        newRank = foundRank || RANKS[0]!;
    } else {
        newRank = RANKS[0]!;
    }
  } else {
    // Determine low ranks based on simple total games comparisons or default
    // If < 10 games and no tier met -> Principiante / Novato
    if (last30.length > 0) {
        // Simple logic for low levels if no streak tier met
        // E.g. 1 win in 10 games?
        const winRate = winsIn30 / last30.length;
        if (last30.length >= 10 && winRate < 0.1) {
             // 0 wins in 10 -> Loser logic (Perdedor)
             // User rule: "If they lose 10 out of 10 -> instantly assign Loser"
             // Check last 10
             const last10 = sortedGames.slice(0, 10);
             const winsIn10 = last10.filter(g => g.isWin).length;
             if (last10.length === 10 && winsIn10 === 0) {
                 const loserRank = FALLING_RANKS[2];
                 return {
                     newRank: { ...(loserRank || RANKS[0]!), order: -1 }, // Perdedor
                     winsIn30,
                     totalGamesEvaluated: last30.length
                 };
             }
             // Otherwise Struggle
             const struggleRank = FALLING_RANKS[1];
             newRank = { ...(struggleRank || RANKS[0]!), order: -1 }; // Jugador en Apuros
        } else if (last30.length >= 5 && winRate < 0.2) {
             newRank = RANKS[0]!; // Principiante
        } else {
             // Default climb
             // If they won at least 1 game recently but didn't hit a streak tier?
             // Maybe Novato?
             newRank = RANKS[1]!; // Novato
        }
    } else {
        newRank = RANKS[0]!; // Principiante (0 games)
    }
  }

  // Check for "God" condition override: "If they win 10 out of 10 -> instantly award Master of the Game"
  if (last30.length >= 10) {
      const last10 = sortedGames.slice(0, 10);
      const winsIn10 = last10.filter(g => g.isWin).length;
      if (winsIn10 === 10) {
          // Find "Maestro del Juego" -> index 14
          newRank = RANKS[14]!;
      }
  }

  // Calculate Next Goal
  // Locate the next tier above current
  let nextTier = null;
  if (highestQualifiedTierIndex < STREAK_TIERS.length - 1) {
      const nextTierDef = STREAK_TIERS[highestQualifiedTierIndex + 1];
      
      if (nextTierDef) {
        const nextGamesWindow = sortedGames.slice(0, nextTierDef.gamesWindow);
        const nextWinsCurrent = nextGamesWindow.filter(g => g.isWin).length;
        const nextRankDef = RANKS[nextTierDef.minRankOrder];
      
        if (nextRankDef) {
            nextTier = {
                winsNeeded: nextTierDef.winsNeeded,
                windowSize: nextTierDef.gamesWindow,
                currentWinsInWindow: nextWinsCurrent,
                targetRankName: nextRankDef.name
            };
        }
      }
  } else if (highestQualifiedTierIndex === -1 && STREAK_TIERS.length > 0) {
       // Aiming for first tier
      const nextTierDef = STREAK_TIERS[0];
      if (nextTierDef) {
        const nextGamesWindow = sortedGames.slice(0, nextTierDef.gamesWindow);
        const nextWinsCurrent = nextGamesWindow.filter(g => g.isWin).length;
        const nextRankDef = RANKS[nextTierDef.minRankOrder];
        
        if (nextRankDef) {
            nextTier = {
               winsNeeded: nextTierDef.winsNeeded,
               windowSize: nextTierDef.gamesWindow,
               currentWinsInWindow: nextWinsCurrent,
               targetRankName: nextRankDef.name
            };
        }
      }
  }


  return {
    newRank,
    winsIn30,
    totalGamesEvaluated: last30.length,
    nextTierProgress: nextTier || undefined
  };
}
