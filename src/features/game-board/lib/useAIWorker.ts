import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState, Move } from '../../../entities/game/types';
import { generateUUID } from '../../../shared/utils/uuid';

interface AIWorkerResponse {
  type: 'MOVE_READY' | 'ERROR';
  move?: Move | null;
  error?: string;
  requestId: string;
}

/**
 * Custom hook to manage the AI Web Worker
 * Handles lifecycle and communication with the background AI thread
 */
export function useAIWorker(onMoveReceived: (move: Move | null) => void) {
  const [isThinking, setIsThinking] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const callbackRef = useRef(onMoveReceived);

  // Keep callback fresh
  useEffect(() => {
    callbackRef.current = onMoveReceived;
  }, [onMoveReceived]);

  // Initialize worker on mount
  useEffect(() => {
    // Vite-specific worker syntax
    const worker = new Worker(
      new URL('../../ai-worker/worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<AIWorkerResponse>) => {
      const { type, move, error } = event.data;

      if (type === 'MOVE_READY') {
        setIsThinking(false);
        callbackRef.current(move ?? null);
      } else if (type === 'ERROR') {
        setIsThinking(false);
        console.error('AI Worker Error:', error);
      }
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  /**
   * Request a move from the AI
   */
  const requestMove = useCallback((state: GameState) => {
    if (!workerRef.current) {
      console.warn('AI Worker not initialized');
      return;
    }

    setIsThinking(true);
    
    workerRef.current.postMessage({
      type: 'GET_MOVE',
      state,
      requestId: generateUUID(),
    });
  }, []);

  /**
   * Record a human move for learning
   */
  const recordMove = useCallback((state: GameState, move: Move) => {
    if (!workerRef.current) {
      console.warn('AI Worker not initialized');
      return;
    }

    workerRef.current.postMessage({
      type: 'RECORD_MOVE',
      state,
      move,
      requestId: generateUUID(),
    });
  }, []);

  return {
    requestMove,
    recordMove,
    isThinking,
    notifyGameEnd: (
      winner: 'white' | 'black', 
      loser: 'white' | 'black', 
      method: 'normal' | 'gammon' | 'backgammon', 
      score: number, 
      finalBoard: number[],
      whitePlayerId?: string | null,
      blackPlayerId?: string | null
    ) => {
      workerRef.current?.postMessage({
        type: 'GAME_OVER',
        winner,
        loser,
        method,
        score,
        finalBoard,
        whitePlayerId,
        blackPlayerId,
        requestId: generateUUID(),
      });
    },
  };
}
