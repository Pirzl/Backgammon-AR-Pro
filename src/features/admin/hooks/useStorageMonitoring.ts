import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';

interface TableSize {
  table_name: string;
  size_kb: number;
  row_count: number;
}

export interface StorageStats {
  totalKB: number;
  usedKB: number;
  percentUsed: number;
  byTable: {
    [key: string]: {
      sizeKB: number;
      rowCount: number;
    };
  };
  lastUpdated: string;
}

const FREE_TIER_LIMIT_KB = 512000; // 500 MB in KB

export function useStorageMonitoring() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStorageStats();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchStorageStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStorageStats() {
    try {
      // Call the admin-only RPC function
      const { data, error: rpcError } = await supabase
        .rpc('get_table_sizes');

      if (rpcError) {
        // If not admin, this will fail with permission denied
        if (rpcError.message?.includes('Access denied')) {
          throw new Error('Admin access required');
        }
        throw rpcError;
      }

      if (!data) {
        throw new Error('No data returned from storage monitoring');
      }

      // Type assertion for the returned data
      const tableData = data as TableSize[];

      // Calculate total used storage
      const totalUsed = tableData.reduce((sum: number, table: TableSize) => sum + table.size_kb, 0);

      // Group by table name
      const byTable: StorageStats['byTable'] = {};
      tableData.forEach((table: TableSize) => {
        // Extract just the table name (remove schema prefix)
        const tableName = table.table_name.split('.').pop() || table.table_name;
        byTable[tableName] = {
          sizeKB: table.size_kb,
          rowCount: table.row_count
        };
      });

      setStats({
        totalKB: FREE_TIER_LIMIT_KB,
        usedKB: totalUsed,
        percentUsed: (totalUsed / FREE_TIER_LIMIT_KB) * 100,
        byTable,
        lastUpdated: new Date().toISOString()
      });

      setError(null);
    } catch (err) {
      console.error('Failed to fetch storage stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch storage stats');
    } finally {
      setLoading(false);
    }
  }

  const isNearLimit = stats ? stats.percentUsed > 70 : false;
  const isCritical = stats ? stats.percentUsed > 90 : false;

  return { 
    stats, 
    loading, 
    error,
    isNearLimit,
    isCritical,
    refresh: fetchStorageStats 
  };
}
