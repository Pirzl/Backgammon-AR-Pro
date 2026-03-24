import { useState, useCallback } from 'react';
import type { UIGameState } from '../model/types'; // We will remove DragState import
import { getValidMoves } from '../../../entities/game/rules';
import type { Move } from '../../../entities/game/types';

/**
 * Interaction State Machine
 * Decouples the "Intent" (Select/Move) from the "Input" (Touch/Mouse/Camera)
 */
interface SelectionState {
  pointId: number;
  validMoves: Move[];
}

export function useInteraction(
  gameState: UIGameState,
  onMove: (move: Move) => void
) {
  const [selection, setSelection] = useState<SelectionState | null>(null);

  /**
   * Command: Select a piece at a specific point
   * Can be called by Click (Touch) or Pinch-Start (Camera)
   */
  const handleSelect = useCallback((pointId: number) => {
    // 1. Validation: Is there a piece here?
    const checkerCount = gameState.board[pointId] ?? 0;
    if (checkerCount === 0) {
      setSelection(null);
      return;
    }

    // 2. Validation: Is it this player's turn?
    const isWhiteTurn = gameState.turn === 'white';
    const isPlayerPiece = isWhiteTurn ? checkerCount > 0 : checkerCount < 0;

    if (!isPlayerPiece) {
      // Tapped opponent's piece -> Deselect
      setSelection(null);
      return;
    }

    // 3. Logic: Calculate valid moves for this specific piece
    const allValidMoves = getValidMoves(gameState);
    const validMovesForPiece = allValidMoves.filter(m => m.from === pointId);

    // 4. State Update: Set selection (highlight piece + potential targets)
    if (validMovesForPiece.length > 0) {
        setSelection({
            pointId,
            validMoves: validMovesForPiece
        });
    } else {
        // No moves available for this piece, but we still select it to show it's active (visual feedback)
        // or effectively "do nothing" but selecting it allows user to see they clicked it.
        // Design Choice: Select it anyway so user sees "0 moves" instead of thinking tap failed.
        setSelection({
            pointId,
            validMoves: []
        });
    }

  }, [gameState]);

  /**
   * Command: Execute move to a target point
   * Can be called by Click (Touch) or Pinch-Release (Camera)
   */
  const handleMove = useCallback((targetPointId: number) => {
    if (!selection) return;

    // 1. Find the specific move that matches this target
    const move = selection.validMoves.find(m => m.to === targetPointId);

    if (move) {
      // 2. Execute
      onMove(move);
      // 3. Reset (Transition to IDLE)
      setSelection(null);
    } else {
      // Invalid target for *this* piece. 
      // User might be trying to select a different piece?
      // Check if target has own pieces.
      const targetCheckers = gameState.board[targetPointId] ?? 0;
      const isWhiteTurn = gameState.turn === 'white';
      const isPlayerPiece = isWhiteTurn ? targetCheckers > 0 : targetCheckers < 0;
      
      if (isPlayerPiece) {
          // Switch selection to new piece
          handleSelect(targetPointId);
      } else {
          // Tapped empty space or opponent -> Deselect
          setSelection(null);
      }
    }
  }, [selection, onMove, gameState, handleSelect]);

  /**
   * Command: Cancel Selection
   */
  const handleCancel = useCallback(() => {
    setSelection(null);
  }, []);

  return {
    // State for UI
    selectedPoint: selection?.pointId ?? null,
    validTargetPoints: selection?.validMoves.map(m => m.to) ?? [],
    
    // Commands for Inputs
    selectPiece: handleSelect,
    executeMove: handleMove,
    cancelSelection: handleCancel
  };
}
