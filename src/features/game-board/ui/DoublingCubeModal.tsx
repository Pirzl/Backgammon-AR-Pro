/**
 * Doubling Cube Modal Component
 * Handles doubling cube actions: Offer, Take, Drop
 */

import { X } from 'lucide-react';

interface DoublingCubeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cubeValue: number;
  cubeOwner: 'white' | 'black' | null;
  myColor: 'white' | 'black' | null;
  currentTurn: 'white' | 'black';
  diceRolled: boolean; // true if dice have been rolled this turn
  
  // Actions
  onOfferDouble: () => void;
  onTakeDouble: () => void;
  onDropDouble: () => void;
}

export function DoublingCubeModal({
  isOpen,
  onClose,
  cubeValue,
  cubeOwner,
  myColor,
  currentTurn,
  diceRolled,
  onOfferDouble,
  onTakeDouble,
  onDropDouble,
}: DoublingCubeModalProps) {
  if (!isOpen) return null;

  // Determine what actions are available
  // canOffer mirrors the reducer rule: the cube may be offered when it is
  // neutral (cubeOwner null) OR when the current player owns it (redouble).
  // (Previous gate required cubeOwner === null, so the cube OWNER never saw an
  //  offer button even though the reducer + the info text said he could — that
  //  blocked x2→x4→…→x64 redoubles after a take.)
  const canOffer =
    (cubeOwner === null || cubeOwner === myColor) && cubeValue < 64 && currentTurn === myColor && !diceRolled;
  const canTake = 
    cubeOwner === null && cubeValue > 1 && currentTurn === myColor && !diceRolled;
  const canDrop = 
    cubeOwner === null && cubeValue > 1 && currentTurn === myColor && !diceRolled;
  
  const isDoubleOffered = cubeOwner === null && cubeValue > 1;
  const nextCubeValue = cubeValue * 2;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gradient-to-br from-amber-900/95 to-amber-950/95 border-2 border-amber-700/50 rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-black text-amber-100 uppercase tracking-wider">
            Cubo de Duplicación
          </h2>
          <button
            onClick={onClose}
            className="text-amber-200 hover:text-white transition-colors p-1 rounded-lg hover:bg-amber-800/50"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Current State */}
        <div className="mb-6 p-4 bg-black/30 rounded-lg border border-amber-700/30">
          <div className="text-sm text-amber-300/80 mb-2">Valor actual</div>
          <div className="text-3xl font-black text-amber-100">{cubeValue === 1 ? '64' : cubeValue}</div>
          {isDoubleOffered && (
            <div className="mt-3 pt-3 border-t border-amber-700/30">
              <div className="text-sm text-amber-300/80 mb-1">Valor ofrecido</div>
              <div className="text-xl font-bold text-amber-200">{nextCubeValue}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Offer Double */}
          {canOffer && (
            <button
              onClick={() => {
                onOfferDouble();
                onClose();
              }}
              className="w-full py-4 px-6 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Ofrecer duplicar a x{nextCubeValue}
            </button>
          )}

          {/* Take Double */}
          {canTake && isDoubleOffered && (
            <button
              onClick={() => {
                onTakeDouble();
                onClose();
              }}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Tomar (Aceptar)
            </button>
          )}

          {/* Drop Double */}
          {canDrop && isDoubleOffered && (
            <button
              onClick={() => {
                onDropDouble();
                onClose();
              }}
              className="w-full py-4 px-6 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Tirar (Rechazar) - Pierdes {cubeValue / 2} puntos
            </button>
          )}

          {/* Info Messages */}
          {!canOffer && !canTake && !canDrop && (
            <div className="text-center py-4 text-amber-300/70 text-sm">
              {diceRolled && (
                <p>Solo puedes ofrecer/aceptar/rechazar duplicaciones antes de tirar los dados.</p>
              )}
              {cubeOwner === myColor && cubeValue < 64 && (
                <p>Eres dueño del cubo. Puedes ofrecer duplicar en tu turno (antes de tirar).</p>
              )}
              {cubeOwner !== null && cubeOwner !== myColor && (
                <p>Tu oponente es dueño del cubo. Puede ofrecer duplicar en su turno.</p>
              )}
              {cubeValue >= 64 && (
                <p>El cubo ya está al valor máximo (64).</p>
              )}
              {/* Explain cube ownership rule */}
              {cubeOwner !== null && (
                <p className="mt-2 text-xs text-amber-400/60 italic">
                  💡 Solo el dueño del cubo puede ofrecer duplicar. Si tu oponente acepta, él será el nuevo dueño del cubo.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Rules Info */}
        <div className="mt-6 pt-4 border-t border-amber-700/30">
          <details className="text-xs text-amber-300/60">
            <summary className="cursor-pointer hover:text-amber-300/80 mb-2">
              ¿Cómo funciona la duplicación?
            </summary>
            <ul className="list-disc list-inside space-y-1 mt-2 pl-2">
              <li>Puedes ofrecer duplicar antes de tirar los dados en tu turno.</li>
              <li>Si tu oponente acepta (toma), el valor del juego se duplica y se queda con el cubo.</li>
              <li>Si tu oponente rechaza (tira), pierde el valor actual y ganas.</li>
              <li>Solo el dueño del cubo puede ofrecer la siguiente duplicación.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
