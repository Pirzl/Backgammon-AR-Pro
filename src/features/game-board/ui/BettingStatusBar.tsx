/**
 * Betting Status Bar Component
 * Shows dynamic messages about betting actions below the board
 * Also shows the current stake inline so there's no floating badge on the board.
 */

interface BettingStatusBarProps {
  messages: string[];
  currentStake?: number; // pts total (stakeInicial * cube)
}

export function BettingStatusBar({ messages, currentStake }: BettingStatusBarProps) {
  const hasMessage = messages.length > 0;
  const currentMessage = hasMessage ? messages[messages.length - 1] : null;

  if (!hasMessage && !currentStake) return null;

  return (
    <div className="w-full px-2 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-amber-900/30 via-amber-800/20 to-amber-900/30 border-t border-amber-700/30 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-3 max-w-7xl mx-auto">
        {currentMessage && (
          <div className="text-xs sm:text-sm text-amber-200/90 font-medium animate-in fade-in slide-in-from-bottom-2 duration-300 text-center px-2">
            {currentMessage}
          </div>
        )}
        {currentStake !== undefined && currentStake > 0 && (
          <>
            {currentMessage && (
              <span className="text-amber-600/60 select-none">•</span>
            )}
            <span
              className="font-black tabular-nums text-amber-300 whitespace-nowrap"
              style={{ fontSize: 'clamp(12px, 1.8vw, 20px)', textShadow: '0 0 10px rgba(245,158,11,0.5)' }}
            >
              {currentStake.toLocaleString()} pts
            </span>
          </>
        )}
      </div>
    </div>
  );
}
