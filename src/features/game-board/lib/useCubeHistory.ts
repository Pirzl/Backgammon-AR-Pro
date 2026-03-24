/**
 * Cube History Hook
 * Manages doubling cube history for a match
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';

export interface CubeHistoryEntry {
  id: string;
  actor_id: string;
  actor: 'white' | 'black';
  accion: 'offer' | 'accept' | 'deny';
  valor_cubo: number;
  timestamp: Date;
}

export function useCubeHistory(matchId: string | null) {
  const [history, setHistory] = useState<CubeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch initial history
  useEffect(() => {
    if (!matchId) {
      setHistory([]);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('cube_history')
          .select('*')
          .eq('match_id', matchId)
          .order('timestamp', { ascending: true });

        if (error) throw error;

        // Transform to include actor color
        const transformed = (data || []).map(entry => ({
          id: entry.id,
          actor_id: entry.actor_id,
          actor: entry.cube_owner_after || entry.cube_owner_before || 'white', // Fallback
          accion: entry.accion,
          valor_cubo: entry.valor_cubo,
          timestamp: new Date(entry.timestamp),
        }));

        setHistory(transformed);
      } catch (err) {
        console.error('Error fetching cube history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Subscribe to new entries
    const channel = supabase
      .channel(`cube-history-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cube_history',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newEntry: CubeHistoryEntry = {
            id: payload.new.id,
            actor_id: payload.new.actor_id,
            actor: payload.new.cube_owner_after || payload.new.cube_owner_before || 'white',
            accion: payload.new.accion,
            valor_cubo: payload.new.valor_cubo,
            timestamp: new Date(payload.new.timestamp),
          };
          setHistory(prev => [...prev, newEntry]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const addHistoryEntry = useCallback(async (
    matchId: string,
    actorId: string,
    _actorColor: 'white' | 'black',
    accion: 'offer' | 'accept' | 'deny',
    valorCubo: number,
    cubeOwnerBefore: 'white' | 'black' | null,
    cubeOwnerAfter: 'white' | 'black' | null
  ) => {
    try {
      const { data, error } = await supabase
        .from('cube_history')
        .insert({
          match_id: matchId,
          actor_id: actorId,
          accion,
          valor_cubo: valorCubo,
          cube_owner_before: cubeOwnerBefore,
          cube_owner_after: cubeOwnerAfter,
        })
        .select()
        .single();

      if (error) throw error;

      // The subscription will update the state automatically
      return data;
    } catch (err) {
      console.error('Error adding cube history:', err);
      throw err;
    }
  }, []);

  return {
    history,
    loading,
    addHistoryEntry,
  };
}
