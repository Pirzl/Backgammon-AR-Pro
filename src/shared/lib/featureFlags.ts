/**
 * Feature Flags Configuration
 * Centralized control for rolling out new features safely.
 */

export const FEATURES = {
    // Enable optimizations for the Off-Tray (Draw Area) layout to prevent overflow
    ENABLE_OFF_TRAY_FIX: true,
    
    // Enable smart camera tracking that disables during AI turns
    ENABLE_SMART_TRACKING: true,
    
    // Enable telemetry logging for layout and tracking events
    ENABLE_LAYOUT_LOGGING: true,

    // Crystal Window Prototype - Master Flag
    ENABLE_CRYSTAL_WINDOW: true
} as const;

export type FeatureFlag = keyof typeof FEATURES;

export const isFeatureEnabled = (feature: FeatureFlag): boolean => {
    return FEATURES[feature];
};
