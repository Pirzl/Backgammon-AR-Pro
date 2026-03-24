import { useContext } from 'react';
import { GameSettingsContext } from './GameSettingsContext';

/**
 * Hook to access game settings context
 */
export function useGameSettings() {
  const context = useContext(GameSettingsContext);
  if (!context) {
    throw new Error('useGameSettings must be used within a GameSettingsProvider');
  }
  return context;
}
