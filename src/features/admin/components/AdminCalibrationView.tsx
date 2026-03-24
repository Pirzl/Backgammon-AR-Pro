import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { Camera, AlertTriangle, Check, Smartphone, X } from 'lucide-react';

interface CalibrationDevice {
  id: number;
  device_fingerprint: string;
  device_name: string | null;
  quality_score: string;
  error_pixels: number;
  created_at: string;
  last_used_at: string;
}

interface AdminCalibrationViewProps {
  userId: string;
}

/**
 * Admin-facing component to view user's hand tracking calibration devices
 * Shows all calibrated devices for anti-cheating monitoring
 */
export function AdminCalibrationView({ userId }: AdminCalibrationViewProps) {
  const [devices, setDevices] = useState<CalibrationDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_hand_calibrations')
        .select('*')
        .eq('user_id', userId)
        .order('last_used_at', { ascending: false });

      if (error) {
        console.error('Error fetching user calibrations:', error);
        setLoading(false);
        return;
      }

      setDevices(data || []);
      setLoading(false);
    };

    fetchDevices();
  }, [userId]);

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-emerald-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'good': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'poor': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Camera className="w-5 h-5 text-cyan-400" />
          <h4 className="font-semibold text-white">Hand Tracking Calibration</h4>
        </div>
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5 text-cyan-400" />
          <h4 className="font-semibold text-white">Hand Tracking Calibration</h4>
        </div>
        <div className="text-sm text-gray-400">
          {devices.length} {devices.length === 1 ? 'dispositivo' : 'dispositivos'}
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
          <X className="w-5 h-5 text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-400">Sin calibración</p>
            <p className="text-xs text-gray-500">El usuario no ha calibrado ningún dispositivo</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device, index) => (
            <div
              key={device.id}
              className={`p-4 rounded-lg border ${
                index === 0
                  ? 'bg-cyan-500/5 border-cyan-500/30'
                  : 'bg-slate-900/30 border-slate-700/50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-white">
                    {device.device_name || 'Dispositivo desconocido'}
                  </span>
                  {index === 0 && (
                    <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                      Más reciente
                    </span>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${getQualityBadge(device.quality_score)}`}>
                  {getQualityLabel(device.quality_score)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Error promedio:</span>
                  <span className={`ml-2 font-medium ${getQualityColor(device.quality_score)}`}>
                    {device.error_pixels.toFixed(2)}px
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Último uso:</span>
                  <span className="ml-2 text-gray-300">
                    {new Date(device.last_used_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Creado:</span>
                  <span className="ml-2 text-gray-300">
                    {new Date(device.created_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Fingerprint:</span>
                  <span className="ml-2 text-gray-400 font-mono text-[10px]">
                    {device.device_fingerprint.substring(0, 16)}...
                  </span>
                </div>
              </div>

              {device.quality_score === 'poor' && (
                <div className="mt-3 flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">
                    Calibración de baja calidad - puede afectar precisión del hand tracking
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {devices.length > 1 && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              <strong>Múltiples dispositivos detectados.</strong> El usuario ha calibrado {devices.length} dispositivos diferentes.
              Esto es normal si el usuario juega desde varios lugares (casa, trabajo, móvil, etc.).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
