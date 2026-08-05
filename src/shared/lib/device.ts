// ----------------------------------------------------------------------
// DEVICE DETECTION (mobile-safe performance)
// ----------------------------------------------------------------------
// Detectamos dispositivos móviles para bajar resolución / FPS / coste de
// detección y evitar sobrecalentamiento. Coarse pointer + UA = robusto
// para móviles y tablets.
// ----------------------------------------------------------------------

let cached: boolean | null = null;

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;

  const coarsePointer = window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const touchPoints = (navigator.maxTouchPoints || 0) > 0;

  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const uaMobile =
    /Android|iPhone|iPad|iPod|Mobile|Silk|Windows Phone|BlackBerry/i.test(ua);

  // Desktop con pantalla táctil (touch laptop) NO debe tratarse como móvil:
  // requiere el UA móvil O (coarse pointer sin teclado físico).
  const isTabletLike = /iPad|Android(?!.*Mobile)|Silk/i.test(ua);

  if (uaMobile || isTabletLike) return true;
  if (coarsePointer && touchPoints && !/Windows|Macintosh|Linux/i.test(ua)) return true;
  return false;
}

/** ¿Es un dispositivo móvil/tablet? (cacheado por sesión) */
export function isMobileDevice(): boolean {
  if (cached === null) cached = detectMobile();
  return cached;
}

/** Perfil de potencia: umbrales de rendimiento por dispositivo. */
export const POWER_PROFILE = {
  // Detección activa (hay mano en cámara)
  activeIntervalMs: () => (isMobileDevice() ? 100 : 33),   // 10fps móvil, 30fps desktop
  // Escaneo idle (sin mano detectada recientemente)
  idleIntervalMs: () => (isMobileDevice() ? 200 : 100),    // 5fps móvil, 10fps desktop
  // Tiempo sin mano tras el cual entramos en modo idle
  idleAfterMs: 1500,
  // Factor de downscale del frame enviado a detección
  frameScale: () => (isMobileDevice() ? 0.5 : 1),
} as const;
