
export function detectOS(): 'ios' | 'android' | 'windows' | 'macos' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;

  if (/windows phone/i.test(ua)) {
    return "windows";
  }

  if (/android/i.test(ua)) {
    return "android";
  }

  // iOS detection
  if (/iPad|iPhone|iPod/.test(ua) || 
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }

  if (/Win/i.test(ua)) {
    return "windows";
  }

  if (/Mac/i.test(ua)) {
    return "macos";
  }

  return "unknown";
}
