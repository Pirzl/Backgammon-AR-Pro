import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise: ReturnType<typeof FingerprintJS.load> | null = null;

/**
 * Get a unique device fingerprint using FingerprintJS
 * Returns consistent ID across browser sessions on the same device
 */
export async function getDeviceFingerprint(): Promise<string> {
  try {
    if (!fpPromise) {
      fpPromise = FingerprintJS.load();
    }
    const fp = await fpPromise;
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error('Failed to get device fingerprint:', error);
    // Fallback: generate random ID and store in localStorage
    let fallbackId = localStorage.getItem('vivo_device_id');
    if (!fallbackId) {
      fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('vivo_device_id', fallbackId);
    }
    return fallbackId;
  }
}

/**
 * Get user-friendly device name (e.g., "Chrome on Windows")
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  const browserName = getBrowserName(ua);
  const osName = getOSName(ua);
  return `${browserName} on ${osName}`;
}

function getBrowserName(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Unknown Browser';
}

function getOSName(ua: string): string {
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown OS';
}
