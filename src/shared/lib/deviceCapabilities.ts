/**
 * Interface for Navigator with non-standard properties (deviceMemory)
 */
interface ExtendedNavigator extends Navigator {
  deviceMemory?: number;
}

export interface DeviceCapabilities {
  isLowEnd: boolean;
  coreCount: number;
  memoryGB?: number;
}

/**
 * Detects device capabilities to adjust performance settings.
 * Heuristic: Low End if < 4 Cores OR < 4GB RAM.
 */
export function getDeviceCapabilities(): DeviceCapabilities {
  const nav = navigator as ExtendedNavigator;
  const coreCount = nav.hardwareConcurrency || 4; // Default to 4 if unknown
  const memoryGB = nav.deviceMemory;

  // Strict Low-End definition for our heavy ML workload
  // If we have < 4 cores, we are definitely low end.
  // If we have < 4GB RAM (approx), we might struggle with multiple 1080p streams + TFJS.
  const isLowEnd = coreCount < 4 || (memoryGB !== undefined && memoryGB < 4);

  return {
    isLowEnd,
    coreCount,
    memoryGB
  };
}
