import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { GameSetting } from '../../entities/tournament/types';
import { STORAGE_KEY, DEFAULT_GAMES, type GameMode, type GameSettingsContextValue } from './gameSettingsTypes';
import { supabase } from '../../shared/api/supabase';

// Re-export types for convenience
export type { GameMode } from './gameSettingsTypes';

// Context definition (kept in same file for Windows compatibility)
// eslint-disable-next-line react-refresh/only-export-components
export const GameSettingsContext = createContext<GameSettingsContextValue | null>(null);

/**
 * Provider component for game settings state
 * Centralizes game mode settings between CRM and game components
 * Now fetches from Supabase for cross-user sync
 */
export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [games, setGamesState] = useState<GameSetting[]>(() => {
    // Try loading from localStorage as initial cache
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load game settings from storage:', e);
    }
    return DEFAULT_GAMES;
  });

  const [maintenanceAllowlist, setMaintenanceAllowlist] = useState<string[]>([]);
  const [tournamentRules, setTournamentRules] = useState<string>('Standard Backgammon Rules apply.');

  // Fetch settings from Supabase
  const fetchSettingsFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('games, maintenance_allowlist, tournament_rules')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Error fetching app settings:', error);
        return;
      }

      if (data) {
        if (data.games) {
            const fetchedGames = data.games as GameSetting[];
            setGamesState(fetchedGames);
            try {
               localStorage.setItem(STORAGE_KEY, JSON.stringify(fetchedGames));
            } catch (e) {
               console.warn('Failed to cache settings:', e);
            }
        }
        if (data.maintenance_allowlist) {
            setMaintenanceAllowlist(data.maintenance_allowlist);
        }
        if (data.tournament_rules !== undefined) {
            setTournamentRules(data.tournament_rules || '');
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching settings:', err);
    }
  };

  // Fetch settings from Supabase on mount
  useEffect(() => {
    // Use void IIFE to properly handle async in useEffect
    void (async () => {
      await fetchSettingsFromSupabase();
    })();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('app_settings_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'id=eq.1'
        },
        (payload) => {
          if (payload.new.games) {
             const newGames = payload.new.games as GameSetting[];
             setGamesState(newGames);
             try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newGames));
             } catch (e) {
                console.warn('Failed to cache settings:', e);
             }
          }
          if (payload.new.maintenance_allowlist) {
              setMaintenanceAllowlist(payload.new.maintenance_allowlist);
          }
          if (payload.new.tournament_rules !== undefined) {
              setTournamentRules(payload.new.tournament_rules || '');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Check if a specific game mode is active
  // Default: a mode NOT explicitly configured counts as ACTIVE (maintenance is opt-in disable).
  // Without this, valid modes like 'training' that aren't in app_settings.games
  // would be silently blocked and redirected to /maintenance.
  const isGameModeActive = useCallback((mode: GameMode): boolean => {
    const game = games.find(g => g.id === mode);
    return game?.isActive ?? true;
  }, [games]);

  // Update a single game's status
  const updateGameStatus = useCallback(async (gameId: string, isActive: boolean) => {
    // Optimistic update
    const updatedGames = games.map(game => 
      game.id === gameId ? { ...game, isActive } : game
    );
    setGamesState(updatedGames);

    // Persist to Supabase
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ games: updatedGames })
        .eq('id', 1);

      if (error) {
        console.error('Error updating game status:', error);
        // Revert on error
        setGamesState(games);
      }
    } catch (err) {
      console.error('Unexpected error updating game status:', err);
      // Revert on error
      setGamesState(games);
    }
  }, [games]);

  // Set all games (used for syncing from CRM)
  const setGames = useCallback(async (newGames: GameSetting[]) => {
    // Optimistic update
    setGamesState(newGames);

    // Persist to Supabase
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ games: newGames })
        .eq('id', 1);

      if (error) {
        console.error('Error updating games:', error);
        // Revert on error
        setGamesState(games);
      }
    } catch (err) {
      console.error('Unexpected error updating games:', err);
      // Revert on error
      setGamesState(games);
    }
  }, [games]);

  // Update Maintenance Allowlist
  const updateMaintenanceAllowlist = useCallback(async (emails: string[]) => {
      // Optimistic
      setMaintenanceAllowlist(emails);

      try {
          const { error } = await supabase
            .from('app_settings')
            .update({ maintenance_allowlist: emails })
            .eq('id', 1);
          
          if (error) {
              console.error('Error updating allowlist:', error);
              // Revert ? We don't track prev state easily here without ref or reducer, 
              // but in production code we should. For now, we trust.
          }
      } catch (err) {
          console.error('Error updating allowlist:', err);
      }
  }, []);

  // Update Tournament Rules
  const updateTournamentRules = useCallback(async (rules: string) => {
      setTournamentRules(rules);

      try {
          const { error } = await supabase
            .from('app_settings')
            .update({ tournament_rules: rules })
            .eq('id', 1);
          
          if (error) {
              console.error('Error updating tournament rules:', error);
          }
      } catch (err) {
          console.error('Error updating tournament rules:', err);
      }
  }, []);

  return (
    <GameSettingsContext.Provider value={{ games, maintenanceAllowlist, tournamentRules, isGameModeActive, updateGameStatus, updateMaintenanceAllowlist, updateTournamentRules, setGames }}>
      {children}
    </GameSettingsContext.Provider>
  );
}
