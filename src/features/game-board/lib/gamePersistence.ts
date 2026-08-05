/**
 * Game state persistence.
 * Saves the current UIGameState to localStorage so a page refresh (or accidental
 * close) does not lose an in-progress game. Online (realtime) games are NOT
 * persisted — the authoritative state lives on the server, and restoring a stale
 * local copy would diverge from the opponent's board.
 */

import type { UIGameState } from '../model/types';

const GAME_KEY = 'backgammon-vivo-game-state';

/** Only persist local modes. Networked modes keep state on the server. */
function isPersistableMode(initialMode: string | undefined): boolean {
  return initialMode === 'ai' || initialMode === 'training' || initialMode === 'local';
}

export function saveGame(state: UIGameState, initialMode?: string): void {
  if (!isPersistableMode(initialMode)) return;
  if (state.winner) {
    clearGame();
    return;
  }
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(state));
  } catch {
    /* storage full / unavailable — fail silently, game still playable */
  }
}

export function loadGame(initialMode?: string): UIGameState | null {
  if (!isPersistableMode(initialMode)) return null;
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UIGameState;
    // Basic shape guard so a corrupt/old payload never crashes the reducer.
    if (!parsed || !Array.isArray(parsed.board) || typeof parsed.turn !== 'string') {
      clearGame();
      return null;
    }
    return parsed;
  } catch {
    clearGame();
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSavedGame(initialMode?: string): boolean {
  return loadGame(initialMode) !== null;
}
