import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';

/**
 * Filters for participation data
 */
export interface ParticipationFilters {
  startDate?: Date;
  endDate?: Date;
  playerId?: string;
  tournamentId?: string;
  includeAnonymous?: boolean;
  userType?: 'all' | 'new' | 'deleted';
}

/**
 * Single data point for the participation graph
 */
export interface ParticipationDataPoint {
  date: string;       // ISO date (YYYY-MM-DD)
  name: string;       // Display name (e.g., "Mon", "Tue")
  count: number;      // Number of matches
}

/**
 * Hook return type
 */
interface UseMatchParticipationReturn {
  data: ParticipationDataPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Get the last N days as an array of ISO date strings
 */
function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (dateStr) dates.push(dateStr);
  }
  return dates;
}

/**
 * Get weekday abbreviation from date string
 */
function getWeekdayName(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Hook to fetch participation data for the dashboard graph
 * Queries game_logs table and aggregates matches per day
 * 
 * @param filters - Optional filters for the data
 * @returns { data, loading, error, refetch }
 */
export function useMatchParticipation(
  filters?: ParticipationFilters
): UseMatchParticipationReturn {
  const [data, setData] = useState<ParticipationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Determine date range (default: last 7 days)
      const endDate = filters?.endDate || new Date();
      const startDate = filters?.startDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d;
      })();

      // Format dates for Postgres query
      const startStr = startDate.toISOString();
      const endStr = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString(); // End of day

      // Build query
      let query = supabase
        .from('game_logs')
        .select('played_at')
        .gte('played_at', startStr)
        .lt('played_at', endStr);

      // Apply player filter using white_player_id and black_player_id
      if (filters?.playerId && filters.playerId !== 'anonymous') {
        query = query.or(`white_player_id.eq.${filters.playerId},black_player_id.eq.${filters.playerId}`);
      } else if (filters?.playerId === 'anonymous') {
        // Anonymous = games where both player ids are null
        query = query.is('white_player_id', null).is('black_player_id', null);
      }

      const { data: logs, error: queryError } = await query;

      if (queryError) {
        throw queryError;
      }

      // Get all dates in range for consistent display
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const allDates = getLastNDays(daysDiff);

      // Count matches per day
      const countsByDate: Record<string, number> = {};
      allDates.forEach(date => {
        countsByDate[date] = 0;
      });

      if (logs) {
        logs.forEach((log: { played_at: string }) => {
          const dateParts = log.played_at.split('T');
          const date = dateParts[0];
          if (date && date in countsByDate) {
            countsByDate[date] = (countsByDate[date] ?? 0) + 1;
          }
        });
      }

      // Transform to chart format
      const chartData: ParticipationDataPoint[] = allDates.map(date => ({
        date,
        name: getWeekdayName(date),
        count: countsByDate[date] || 0
      }));

      setData(chartData);
    } catch (err) {
      console.error('Failed to fetch participation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      
      // Return empty data for last 7 days on error
      setData(getLastNDays(7).map(date => ({
        date,
        name: getWeekdayName(date),
        count: 0
      })));
    } finally {
      setLoading(false);
    }
  }, [filters?.startDate, filters?.endDate, filters?.playerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
