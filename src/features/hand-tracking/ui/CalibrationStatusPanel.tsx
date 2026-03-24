import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { getDeviceFingerprint, getDeviceName } from '../../../shared/lib/deviceFingerprint';
import { Camera, Check, X, Trash2, AlertCircle, Smartphone } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface CalibrationDevice {
  id: number;
  device_fingerprint: string;
  device_name: string | null;
  quality_score: string;
  error_pixels: number;
  created_at: string;
  last_used_at: string;
  is_current: boolean;
}

/**
 * Panel to display and manage hand tracking calibration devices
 * Shows current device status + all calibrated devices
 */
export function CalibrationStatusPanel() {
  const [devices, setDevices] = useState<CalibrationDevice[]>([]);
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Get current user and device
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      
      const fingerprint = await getDeviceFingerprint();
      setCurrentFingerprint(fingerprint);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch calibration devices
  useEffect(() => {
    if (!userId) {
      return;
    }

    const fetchDevices = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_hand_calibrations')
        .select('*')
        .eq('user_id', userId)
        .order('last_used_at', { ascending: false });

      if (error) {
        console.error('Error fetching calibration devices:', error);
        setLoading(false);
        return;
      }

      if (data) {
        const devicesWithCurrent = data.map(d => ({
          ...d,
          is_current: d.device_fingerprint === currentFingerprint
        }));
        setDevices(devicesWithCurrent);
      }
      setLoading(false);
    };

    fetchDevices();
  }, [userId, currentFingerprint]);

  const deleteCalibration = async (id: number) => {
    if (!confirm('¿Eliminar calibración de este dispositivo?')) return;

    const { error } = await supabase
      .from('user_hand_calibrations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting calibration:', error);
      alert('Error al eliminar calibración');
      return;
    }

    setDevices(devices.filter(d => d.id !== id));
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-emerald-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getQualityLabel = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'Excelente';
      case 'good': return 'Buena';
      case 'poor': return 'Pobre';
      default: return 'Desconocida';
    }
  };

  if (!userId) {
    return (
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Camera className="w-6 h-6 text-cyan-400" />
          <h3 className="text-xl font-bold text-white">Hand Tracking Calibration</h3>
        </div>
        <p className="text-gray-400">Inicia sesión para gestionar dispositivos calibrados.</p>
      </div>
    );
  }

  const currentDevice = devices.find(d => d.is_current);

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Camera className="w-6 h-6 text-cyan-400" />
        <h3 className="text-xl font-bold text-white">Hand Tracking Calibration</h3>
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <>
          {/* Current Device Status */}
          <div className="mb-6 p-4 bg-zinc-800/50 rounded-lg border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-white">Dispositivo Actual</span>
              <span className="text-sm text-gray-400">({getDeviceName()})</span>
            </div>
            
            {currentDevice ? (
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Calibrado</span>
                <span className={`text-sm ${getQualityColor(currentDevice.quality_score)}`}>
                  • {getQualityLabel(currentDevice.quality_score)}
                </span>
                <span className="text-xs text-gray-500">
                  (error: {currentDevice.error_pixels.toFixed(2)}px)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <X className="w-5 h-5 text-red-400" />
                <span className="text-red-400 font-medium">No calibrado</span>
                <span className="text-sm text-gray-400">
                  • Activa Hand Tracking y calibra para usar este dispositivo
                </span>
              </div>
            )}
          </div>

          {/* All Devices */}
          {devices.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">
                Todos los Dispositivos ({devices.length})
              </h4>
              <div className="space-y-2">
                {devices.map(device => (
                  <div
                    key={device.id}
                    className={`p-3 rounded-lg border ${
                      device.is_current 
                        ? 'bg-cyan-500/10 border-cyan-500/30' 
                        : 'bg-zinc-800/30 border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-white">
                          {device.device_name || 'Dispositivo desconocido'}
                        </span>
                        {device.is_current && (
                          <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">
                            Actual
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteCalibration(device.id)}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors cursor-pointer"
                        aria-label="Delete calibration"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className={getQualityColor(device.quality_score)}>
                        {getQualityLabel(device.quality_score)}
                      </span>
                      <span>{device.error_pixels.toFixed(2)}px error</span>
                      <span>Último uso: {new Date(device.last_used_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No hay dispositivos calibrados.</p>
              <p className="text-sm text-gray-500 mt-1">
                Activa Hand Tracking en el juego para calibrar este dispositivo.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
