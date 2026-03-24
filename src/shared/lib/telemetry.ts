import { isFeatureEnabled } from './featureFlags';

/**
 * Simple Telemetry Logger
 * Used for debugging layout and tracking state changes during rollout.
 */

type TelemetryEvent = 
    | 'LAYOUT_CALCULATION'
    | 'TRACKING_STATE_CHANGE'
    | 'AI_TURN_START'
    | 'AI_TURN_END'
    | 'GAME_END';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logTelemetry = (event: TelemetryEvent, data: Record<string, any>) => {
    if (!isFeatureEnabled('ENABLE_LAYOUT_LOGGING')) return;

    // In a real app, this would send to an analytics service (PostHog, Datadog, etc.)
    // For now, we use colorful console logs for developer visibility during testing.
    
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, -1);
    
    switch (event) {
        case 'LAYOUT_CALCULATION':
            console.debug(`%c[LAYOUT] ${timestamp}`, 'color: #3b82f6; font-weight: bold;', data);
            break;
        case 'TRACKING_STATE_CHANGE':
            console.log(`%c[TRACKING] ${timestamp}`, 'color: #10b981; font-weight: bold;', data);
            break;
        default:
            console.log(`[${event}]`, data);
    }
};
