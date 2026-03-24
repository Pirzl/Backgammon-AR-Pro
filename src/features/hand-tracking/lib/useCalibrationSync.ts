import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { getDeviceFingerprint, getDeviceName } from '../../../shared/lib/deviceFingerprint';
import type { Session } from '@supabase/supabase-js';

interface CalibrationData {
  version: number;
  corners: Array<{ x: number; y: number }>;
  timestamp: number;
  quality: string;
  error: number;
  handCalibration?: import('./MediaPipeContext').HandCalibration;
}

interface UseCalibrationSyncReturn {
  saveCalibration: (calibrationData: CalibrationData) => Promise<void>;
  loadCalibration: () => Promise<CalibrationData | null>;
  isLoading: boolean;
  deviceFingerprint: string | null;
  isRegisteredUser: boolean;
}

/**
 * Hook to sync hand tracking calibration data to Supabase for registered users
 * Anonymous users continue using localStorage only
 */
export function useCalibrationSync(): UseCalibrationSyncReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);
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

  // Get device fingerprint on mount
  useEffect(() => {
    getDeviceFingerprint().then(setDeviceFingerprint);
  }, []);

  /**
   * Save calibration to Supabase (registered users) or localStorage (anonymous)
   */
  const saveCalibration = useCallback(async (calibrationData: CalibrationData) => {
    if (!deviceFingerprint) {
      console.warn('Device fingerprint not ready, saving to localStorage only');
      localStorage.setItem('vivo_calibration_v3', JSON.stringify(calibrationData));
      return;
    }

    // Always save to localStorage as fallback
    localStorage.setItem('vivo_calibration_v3', JSON.stringify(calibrationData));

    if (!userId) {
      // Anonymous user - localStorage only
      console.log('📍 Anonymous user - calibration saved to localStorage only');
      return;
    }

    // Registered user - save to Supabase
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('user_hand_calibrations')
        .upsert({
          user_id: userId,
          device_fingerprint: deviceFingerprint,
          device_name: getDeviceName(),
          calibration_data: calibrationData,
          hand_calibration: calibrationData.handCalibration || null,
          quality_score: calibrationData.quality,
          error_pixels: calibrationData.error,
          updated_at: new Date().toISOString(),
          last_used_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,device_fingerprint'
        });

      if (error) {
        console.error('Failed to sync calibration to Supabase:', error);
        // Fallback already saved to localStorage
      } else {
        console.log('✅ Calibration synced to Supabase for', getDeviceName());
      }
    } catch (error) {
      console.error('Failed to sync calibration:', error);
      // Fallback already saved to localStorage
    } finally {
      setIsLoading(false);
    }
  }, [userId, deviceFingerprint]);

  /**
   * Check if user is on a new device and create alert if needed
   */
  const checkForNewDevice = useCallback(async () => {
    if (!userId || !deviceFingerprint) return;

    try {
      // Check if user has calibrations for other devices
      const { data: otherDevices, error } = await supabase
        .from('user_hand_calibrations')
        .select('device_name, created_at')
        .eq('user_id', userId)
        .neq('device_fingerprint', deviceFingerprint)
        .limit(1);

      if (error) {
        console.error('Error checking for other devices:', error);
        return;
      }

      if (otherDevices && otherDevices.length > 0) {
        // User has calibrations on other devices - create alert
        const { error: alertError } = await supabase
          .from('user_device_alerts')
          .insert({
            user_id: userId,
            alert_type: 'new_device_calibration_needed',
            device_fingerprint: deviceFingerprint,
            device_name: getDeviceName(),
            message: `Nuevo dispositivo detectado (${getDeviceName()}). Por favor calibra la cámara para este dispositivo.`,
            is_read: false
          });

        if (alertError) {
          console.error('Error creating device alert:', alertError);
        } else {
          console.log('⚠️ New device detected - alert created');
        }
      }
    } catch (error) {
      console.error('Failed to check for new device:', error);
    }
  }, [userId, deviceFingerprint]);

  /**
   * Load calibration from Supabase (registered) or localStorage (anonymous)
   */
  const loadCalibration = useCallback(async (): Promise<CalibrationData | null> => {
    if (!deviceFingerprint) {
      // Device fingerprint not ready, try localStorage
      const localData = localStorage.getItem('vivo_calibration_v3');
      return localData ? JSON.parse(localData) : null;
    }

    // Try localStorage first (instant)
    const localData = localStorage.getItem('vivo_calibration_v3');
    
    if (!userId) {
      // Anonymous user - use localStorage only
      return localData ? JSON.parse(localData) : null;
    }

    // Registered user - check Supabase
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_hand_calibrations')
        .select('*')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .maybeSingle();

      if (error) {
        console.error('Error loading calibration from Supabase:', error);
        // Check if new device
        await checkForNewDevice();
        return localData ? JSON.parse(localData) : null;
      }

      if (!data) {
        // No calibration in Supabase - check if new device
        await checkForNewDevice();
        return localData ? JSON.parse(localData) : null;
      }

      // Update last_used_at
      await supabase
        .from('user_hand_calibrations')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

      // Sync to localStorage
      const fullCalibration = {
        ...data.calibration_data,
        handCalibration: data.hand_calibration
      };
      
      localStorage.setItem('vivo_calibration_v3', JSON.stringify(fullCalibration));
      
      console.log('✅ Calibration loaded from Supabase');
      return fullCalibration as CalibrationData;
    } catch (error) {
      console.error('Failed to load calibration from Supabase:', error);
      return localData ? JSON.parse(localData) : null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, deviceFingerprint, checkForNewDevice]);

  return {
    saveCalibration,
    loadCalibration,
    isLoading,
    deviceFingerprint,
    isRegisteredUser: !!userId
  };
}
