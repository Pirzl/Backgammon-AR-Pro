/**
 * Player Betting Indicator Component
 * Shows wallet balance and reserved stake for each player
 */

interface PlayerBettingIndicatorProps {
  playerColor: 'white' | 'black';
  playerName: string;
  saldo: number;
  apuestaReservada: number;
  isMyColor: boolean;
}

export function PlayerBettingIndicator({
  playerColor,
  playerName,
  saldo,
  apuestaReservada,
  isMyColor,
}: PlayerBettingIndicatorProps) {
  const bgColor = playerColor === 'white' 
    ? 'bg-white/10 border-white/20' 
    : 'bg-red-900/20 border-red-500/20';
  const textColor = playerColor === 'white' 
    ? 'text-white' 
    : 'text-red-200';

  return (
    <div className={`${bgColor} border rounded-lg p-2 backdrop-blur-sm`}>
      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: textColor }}>
        {playerName}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="opacity-70">Saldo:</span>
          <span className="font-bold">{saldo.toLocaleString()} puntos</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-white/10">
          <span className="opacity-70">Apuesta reservada:</span>
          <span className={`font-bold ${isMyColor ? 'text-amber-300' : ''}`}>
            {apuestaReservada.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
