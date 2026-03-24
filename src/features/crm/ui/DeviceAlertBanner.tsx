import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { AlertTriangle, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface DeviceAlert {
  id: number;
  alert_type: string;
  device_name: string | null;
  message: string;
  created_at: string;
}

/**
 * Banner to display device calibration alerts in user's CRM
 * Shows when user logs in on a new device that needs calibration
 */
export function DeviceAlertBanner() {
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch alerts when userId changes
  useEffect(() => {
    if (!userId) {
      // Don't fetch alerts for anonymous users
      return;
    }

    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('user_device_alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching device alerts:', error);
        return;
      }

      if (data) {
        setAlerts(data);
      }
    };

    fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel('device_alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_device_alerts',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const dismissAlert = async (alertId: number) => {
    await supabase
      .from('user_device_alerts')
      .update({ is_read: true })
      .eq('id', alertId);

    setAlerts(alerts.filter(a => a.id !== alertId));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[300] max-w-md space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-4 rounded-2xl shadow-2xl border-2 border-white/30 flex items-start gap-3 animate-in slide-in-from-right"
        >
          <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <div className="font-bold text-sm mb-1">Nuevo Dispositivo Detectado</div>
            <div className="text-sm opacity-90">{alert.message}</div>
            {alert.device_name && (
              <div className="text-xs mt-1 opacity-75">Dispositivo: {alert.device_name}</div>
            )}
          </div>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="p-1 hover:bg-white/20 rounded transition-colors cursor-pointer"
            aria-label="Dismiss alert"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
