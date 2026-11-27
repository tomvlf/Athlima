/**
 * Read-only state key definitions for the top-level live db object. They document ownership
 * boundaries without replacing the existing xf/Proxy compatibility layer.
 */
export const RIDE_STATE_KEYS = Object.freeze([
    'elapsed', 'lapTime', 'stepTime', 'intervalIndex', 'stepIndex',
    'intervalDuration', 'stepDuration', 'watchStatus', 'workoutStatus',
    'workout', 'workoutTextEvent', 'lapStartTime',
]);

export const DEVICE_STATE_KEYS = Object.freeze([
    'power', 'heartRate', 'cadence', 'speed', 'sources', 'connectedDevices',
    'powerTarget', 'resistanceTarget', 'slopeTarget', 'cadenceTarget', 'mode',
]);

export const ACTIVITY_STATE_KEYS = Object.freeze([
    'activity', 'records', 'lap', 'laps', 'events', 'courseIndex',
]);

export const PROFILE_STATE_KEYS = Object.freeze([
    'ftp', 'weight', 'theme', 'dockMode', 'measurement', 'volume',
    'powerSmoothing', 'dataTileSwitch',
]);

export const COACH_STATE_KEYS = Object.freeze([
    'workouts', 'workout',
]);

export function getRideSlice(db) {
    return Object.fromEntries(RIDE_STATE_KEYS.map(key => [key, db[key]]));
}

export function getDeviceSlice(db) {
    return Object.fromEntries(DEVICE_STATE_KEYS.map(key => [key, db[key]]));
}
