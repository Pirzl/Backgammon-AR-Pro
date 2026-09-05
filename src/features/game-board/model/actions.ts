/**
 * Game Actions Reducer for React 19 useActionState
 * Handles all game state transitions with validation
 */

import { applyMove, isValidMove, getValidMoves } from '../../../entities/game/rules';
import { rollDice } from '../../../entities/game/utils';
import type { UIGameState, GameAction } from './types';
import { INITIAL_GAME_STATE, createSnapshot } from './store';
import { supabase } from '../../../shared/api/supabase';
import { generateBoardSummary } from '../lib/useAICommentary';
import { generateEvaluationScore } from '../ai-service';
import { generateUUID } from '../../../shared/utils/uuid';
import { ensureRecorder } from './match-recorder';

/**
 * Game reducer for useActionState
 * IMPORTANT: This is async to support future AI/network integration
 */
export async function gameReducer(
  state: UIGameState,
  action: GameAction
): Promise<UIGameState> {
  // Guard against undefined state
  if (!state) return INITIAL_GAME_STATE;

  switch (action.type) {
    case 'ROLL_DICE': {
      const newDice = 'dice' in action && action.dice ? action.dice : rollDice();
      
      const possibleMoves = getValidMoves({
        ...state,
        dice: newDice,
        usedDice: [],
      });

      const recorder = ensureRecorder(state.game_id);
      recorder.finish(null, null);
      recorder.ensureTurn(state.turn, newDice);

      return {
        ...state,
        dice: newDice,
        usedDice: [],
        rollHistory: [...(state.rollHistory || []), { player: state.turn, dice: newDice }],
        isRolling: true,
        needsTurnConfirmation: possibleMoves.length === 0,
        history: [],
      };
    }

    case 'SYNC_DICE': {
      const incoming = action.dice;
      if (!Array.isArray(incoming) || incoming.length === 0) return state;

      // Always trust the synced dice for this turn branch.
      const possibleMoves = getValidMoves({
        ...state,
        dice: incoming,
        usedDice: [],
      });

      return {
        ...state,
        dice: incoming,
        usedDice: [],
        rollHistory: [...(state.rollHistory || []), { player: state.turn, dice: incoming }],
        isRolling: true,
        needsTurnConfirmation: possibleMoves.length === 0,
        history: [],
      };
    }

    case 'MOVE_CHECKER': {
      const { move } = action;
      
      // Validate move
      const validation = isValidMove(state, move);
      if (!validation.valid) {
        console.warn(`[GameReducer] Invalid move rejected: ${validation.reason}`, move);
        return state; // Graceful return instead of throw to prevent React crash
      }
      
      // Save current state to history
      const snapshot = createSnapshot(state);
      
      // Apply move
      const newBoard = applyMove(state.board, move, state.turn);
      const newUsedDice = [...state.usedDice, move.die];
      
      const recorder = ensureRecorder(state.game_id);
      recorder.ensureTurn(state.turn, state.dice);
      recorder.addMove(move);
      
      // Check if all dice are used or no more moves available
      const updatedState: UIGameState = {
        ...state,
        board: newBoard,
        usedDice: newUsedDice,
        history: [...state.history, snapshot],
      };
      
      // Check if turn should switch logic
      // Fix: Count-based filtering for remaining dice with safety checks
      const remainingDice = [...(state.dice || [])];
      for (const used of newUsedDice) {
          const idx = remainingDice.indexOf(used);
          if (idx !== -1) remainingDice.splice(idx, 1);
      }
      
      // WIN DETECTION
      const OFF_WHITE = 28;
      const OFF_BLACK = 29;
      let winner: 'white' | 'black' | null = null;
      const matchScore = { ...state.matchScore };

      if (newBoard[OFF_WHITE] === 15) {
        winner = 'white';
        matchScore.white += state.cube;
      } else if (newBoard[OFF_BLACK] === -15) {
        winner = 'black';
        matchScore.black += state.cube;
      }

      if (winner) {
        const recorder = ensureRecorder(state.game_id);
        recorder.finish(winner, 'normal');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vivo-match-finished', {
            detail: { game_id: state.game_id, replay: recorder.toJSON() },
          }));
        }
         return {
            ...updatedState,
            winner,
            matchScore,
            dice: [],
            isRolling: false,
            needsTurnConfirmation: false
         };
      }

      let shouldEndTurn = false;

      if (remainingDice.length === 0) {
        // All dice used
        shouldEndTurn = true;
      } else {
         // Check if any moves are possible with remaining dice
         const possibleMoves = getValidMoves({
           ...updatedState,
           dice: state.dice, // Use original dice; getValidMoves handles subtraction via usedDice
           usedDice: newUsedDice,
         });
         
         if (possibleMoves.length === 0) {
           // No more moves possible
           shouldEndTurn = true;
         }
      }

      if (shouldEndTurn) {
         return {
           ...updatedState,
           needsTurnConfirmation: true
         };
      }
      
      // More moves available
      return updatedState;
    }

// ... (in the gameReducer switch case) ...

    case 'CONFIRM_TURN_END': {
        const nextTurn = state.turn === 'white' ? 'black' : 'white';
        const snapshot = createSnapshot(state);
        const { tension, summary } = generateBoardSummary(state);

        const game_id = state.game_id;
        const recorder = ensureRecorder(game_id);

        generateEvaluationScore(summary, tension, state)
          .then(({ evaluation, score }: { evaluation: string, score: number }) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('vivo-equity-update', { detail: { score } }));
            }

            return supabase.from('game_history_analysis').insert({
              game_id,
              turn_number: (state.turn_count ?? 0) + 1,
              player_color: state.turn,
              board_snapshot: snapshot,
              ai_evaluation: evaluation,
              equity_score: score,
              is_win_move: state.winner !== null,
              tension_metric: tension,
            }).then(({ error }: { error: Error | null }) => {
              if (error) console.error('Failed to save game history:', error);
            });
          })
          .catch((err: Error) => console.error("Evaluation error:", err));

        const nextWinner = state.winner;
        if (nextWinner) {
          recorder.finish(nextWinner, nextWinner === 'white' ? 'normal' : 'normal');
          window.dispatchEvent(new CustomEvent('vivo-match-finished', {
            detail: { game_id, replay: recorder.toJSON() },
          }));
        }

        return {
          ...state,
          turn: nextTurn,
          dice: [],
          usedDice: [],
          isRolling: false,
          needsTurnConfirmation: false,
          history: [],
          turn_count: (state.turn_count ?? 0) + 1,
        };
    }

    case 'UNDO_MOVE': {
      if (state.history.length === 0) {
        // Graceful no-op (mirrors MOVE_CHECKER's invalid-move handling).
        // Throwing here lets a rapid undo burst reject a queued dispatch on
        // ONE client only -> the two H2H history stacks diverge and the game
        // sync is lost permanently. Return state unchanged instead.
        console.warn('[GameReducer] Undo ignored: no moves to undo.');
        return state;
      }
      
      // Pop last state from history
      const previousState = state.history[state.history.length - 1];
      if (!previousState) {
        throw new Error('Invalid history state');
      }
      
      return {
        ...previousState,
        game_id: state.game_id,
        history: state.history.slice(0, -1),
        isRolling: false,
        needsTurnConfirmation: false, // Reset confirmation on undo
      };
    }

    case 'OFFER_DOUBLE': {
      // Can only offer double before rolling dice (dice.length === 0)
      // Can only offer if cube is neutral (cubeOwner === null) OR if it's your turn and you own the cube
      // Cannot offer if cube is already at 64 (maximum)
      if (state.dice.length > 0) {
        throw new Error('Cannot offer double after rolling dice');
      }
      
      if (state.cube >= 64) {
        throw new Error('Cube is already at maximum value (64)');
      }
      
      // Check if player can offer: cube must be neutral OR player owns the cube
      const canOffer = state.cubeOwner === null || state.cubeOwner === state.turn;
      if (!canOffer) {
        throw new Error('Only the cube owner can offer to double');
      }
      
      // Calculate next cube value (double it)
      const nextCubeValue = state.cube * 2;
      
      // Save snapshot
      const snapshot = createSnapshot(state);
      
      // Switch turn to opponent - they must respond (accept/reject)
      const nextTurn = state.turn === 'white' ? 'black' : 'white';
      
      return {
        ...state,
        cube: nextCubeValue,
        cubeOwner: null, // Cube is "offered" (neutral until accepted/rejected)
        turn: nextTurn, // Switch to opponent so they can respond
        history: [...state.history, snapshot],
      };
    }

    case 'TAKE_DOUBLE': {
      // Can only take if cube was just offered (cubeOwner === null and cube > 1)
      // The player taking must be the opponent of the one who offered
      if (state.cubeOwner !== null || state.cube <= 1) {
        throw new Error('No double offer to accept');
      }
      
      // Save snapshot
      const snapshot = createSnapshot(state);
      
      // Accepting player becomes the cube owner
      return {
        ...state,
        cubeOwner: state.turn, // Current turn player accepts and owns the cube
        history: [...state.history, snapshot],
        // Game continues normally
      };
    }

    case 'DROP_DOUBLE': {
      // Can only drop if cube was just offered (cubeOwner === null and cube > 1)
      if (state.cubeOwner !== null || state.cube <= 1) {
        throw new Error('No double offer to reject');
      }
      
      // Dropping player loses the game at the CURRENT value (before the proposed double)
      // So we need to revert cube to previous value
      const previousCubeValue = state.cube / 2;
      const winner = state.turn === 'white' ? 'black' : 'white'; // Opponent wins
      const matchScore = { ...state.matchScore };
      
      if (winner === 'white') {
        matchScore.white += previousCubeValue;
      } else {
        matchScore.black += previousCubeValue;
      }
      
      return {
        ...state,
        cube: previousCubeValue, // Revert to value before offer
        cubeOwner: null,
        winner,
        matchScore,
        dice: [], // Clear dice to stop game
        isRolling: false,
        needsTurnConfirmation: false,
      };
    }

    case 'NEW_GAME': {
      // Start a fresh game but preserve the matchScore accumulated
      // while the user stays on the game screen. When the user exits
      // to the index, the whole component unmounts and INITIAL_GAME_STATE
      // (with matchScore 0-0) is restored naturally.
      return {
        ...INITIAL_GAME_STATE,
        game_id: generateUUID(), // Fresh ID for the new game
        matchScore: { ...state.matchScore },
      };
    }

    default:
      return state;
  }
}
