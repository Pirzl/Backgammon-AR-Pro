import type { GameSetting } from '../../entities/tournament/types';

// Game mode identifiers
export type GameMode = 'ai' | 'human';

// Storage key for persisting settings
export const STORAGE_KEY = 'vivo_game_settings';

// Default game settings
export const DEFAULT_GAMES: GameSetting[] = [
  { id: 'ai', name: 'Play against the AI', isActive: true },
  { id: 'human', name: 'Play against humans', isActive: true }
];

// Context value type
export interface GameSettingsContextValue {
  games: GameSetting[];
  maintenanceAllowlist: string[];
  tournamentRules: string;
  isGameModeActive: (mode: GameMode) => boolean;
  updateGameStatus: (gameId: string, isActive: boolean) => void;
  updateMaintenanceAllowlist: (emails: string[]) => void;
  updateTournamentRules: (rules: string) => Promise<void>;
  setGames: (games: GameSetting[]) => void;
}
