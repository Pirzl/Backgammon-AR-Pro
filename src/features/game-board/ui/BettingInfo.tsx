/**
 * Betting Info Component
 * Shows betting information below the doubling cube
 */

interface BettingInfoProps {
  stakeInicial: number;
  cubeValue: number;
  apuestaTotal: number;
  isDoubleOffered: boolean;
  offeredBy: 'white' | 'black' | null;
  myColor: 'white' | 'black' | null;
  onAccept?: () => void;
  onDeny?: () => void;
}

export function BettingInfo({
  stakeInicial,
  cubeValue,
  apuestaTotal,
  isDoubleOffered,
  offeredBy,
  myColor,
  onAccept,
  onDeny,
}: BettingInfoProps) {
  const displayCubeValue = cubeValue === 1 ? 64 : cubeValue;
  const isMyOffer = offeredBy === myColor;
  const canRespond = isDoubleOffered && !isMyOffer && myColor !== null;

  return (
    <div className="w-full mt-2 p-2 sm:p-2.5 bg-gradient-to-br from-amber-900/40 to-amber-950/40 rounded-lg border border-amber-700/30 backdrop-blur-sm">
      {/* Basic Info */}
      <div className="space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs text-amber-200/90">
        <div className="flex justify-between">
          <span className="text-amber-300/70">Apuesta inicial:</span>
          <span className="font-bold text-amber-100">{stakeInicial} pts</span>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-300/70">Cubo actual:</span>
          <span className="font-bold text-amber-100">x{displayCubeValue === 64 ? 1 : displayCubeValue}</span>
        </div>
        <div className="flex justify-between pt-0.5 sm:pt-1 border-t border-amber-700/20">
          <span className="text-amber-300/70 font-semibold">Apuesta total:</span>
          <span className="font-black text-sm sm:text-base text-amber-50">{apuestaTotal} pts</span>
        </div>
      </div>

      {/* Double Offer Alert */}
      {isDoubleOffered && (
        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-amber-700/30">
          <div className="text-[10px] sm:text-xs text-amber-200/80 mb-1.5 sm:mb-2">
            <span className="font-bold text-amber-100">
              {offeredBy === 'white' ? 'BLANCAS' : 'ROJAS'}
            </span>
            {' '}ofrecen doblar a{' '}
            <span className="font-bold text-amber-50">x{cubeValue * 2}</span>
          </div>
          <div className="text-[10px] sm:text-xs text-amber-300/70 mb-2 sm:mb-3">
            Apuesta total si aceptas: <span className="font-bold text-amber-100">{apuestaTotal * 2} pts</span>
          </div>
          
          {/* Action Buttons */}
          {canRespond && (
            <div className="flex gap-1.5 sm:gap-2">
              <button
                onClick={onAccept}
                className="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] sm:text-xs rounded-lg transition-all shadow-lg hover:shadow-xl active:scale-95"
              >
                🟢 Aceptar
              </button>
              <button
                onClick={onDeny}
                className="flex-1 py-1.5 sm:py-2 px-2 sm:px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] sm:text-xs rounded-lg transition-all shadow-lg hover:shadow-xl active:scale-95"
              >
                🔴 Denegar
              </button>
            </div>
          )}
          {isMyOffer && (
            <div className="text-[10px] sm:text-xs text-amber-300/60 text-center py-0.5 sm:py-1">
              Esperando respuesta del oponente...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
