import { Suspense, lazy } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useGameSettings } from '../features/admin/useGameSettings';
import { useAuth } from '../features/auth/useAuth'; // NEW
import type { GameMode } from '../features/admin/GameSettingsContext';

// Lazy load GameBoard to prevent loading heavy assets (MediaPipe) on initial app load
const GameBoard = lazy(() => import('../features/game-board/ui/GameBoard').then(module => ({ default: module.GameBoard })));

/**
 * Route Guard for Game access
 * Checks if the requested game mode is active before allowing access
 * Redirects to maintenance page if the mode is disabled
 */
export function GameRouteGuard() {
  const [searchParams] = useSearchParams();
  const { isGameModeActive, maintenanceAllowlist } = useGameSettings();
  const { user } = useAuth(); // NEW: Need user to check allowlist
  
  // Get mode from URL params
  const modeParam = searchParams.get('mode');
  
  // Determine effective room ID first
  const roomId = searchParams.get('room');
  const tournamentId = searchParams.get('tournamentId');
  const effectiveRoomId = roomId || tournamentId;

  // Validate mode - reject unknown modes
  if (modeParam && modeParam !== 'ai' && modeParam !== 'human' && modeParam !== 'training') {
    console.warn(`Invalid game mode: ${modeParam}`);
    return <Navigate to="/" replace />;
  }
  
  // Smart Mode Detection:
  // 1. If explicit mode is provided, use it.
  // 2. If no mode but we have a room/tournament ID, default to 'human' (prevents AI interference on refresh)
  // 3. Otherwise default to 'ai'
  let mode: GameMode = 'ai';
  if (modeParam === 'human' || modeParam === 'ai' || modeParam === 'training') {
    mode = modeParam as GameMode;
  } else if (effectiveRoomId) {
    console.log(`[GameRouteGuard] No mode param, but room ${effectiveRoomId} detected. Defaulting to 'human'.`);
    mode = 'human';
  }
  
  // Check if the requested mode is active
  const isActive = isGameModeActive(mode);
  
  // Check for maintenance bypass (Allowlist)
  // If user is in allowlist, they are considered "active" regardless of global setting
  const isAllowed = user?.email && maintenanceAllowlist.includes(user.email);
  
  if (!isActive && !isAllowed) {
    // Redirect to maintenance page with mode info
    return <Navigate to={`/maintenance?mode=${mode}`} replace />;
  }
  
  // Mode is active, render the game wrapped in Suspense
  return (
    <Suspense fallback={
      <div className="w-full h-screen flex items-center justify-center bg-black text-cyan-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="font-mono animate-pulse">LOADING GAME ENGINE...</p>
        </div>
      </div>
    }>
      <GameBoard initialMode={mode} initialRoomId={effectiveRoomId} />
    </Suspense>
  );
}
