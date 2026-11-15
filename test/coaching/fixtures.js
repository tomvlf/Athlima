/**
 * Reusable fictional athlete, goal and activity examples for Coach tests. Fixed dates and numbers
 * make the same inputs produce repeatable results, independent of today's date. Fixtures are sample
 * data, not a real athlete record or a recommended training prescription.
 */

import { addDays } from '../../src/coaching/domain.js';
import { normalizeActivity } from '../../src/coaching/normalizer.js';
import { estimateState } from '../../src/coaching/state.js';

export const profile = {
    id: 'athlete', adultAthleteConfirmed: true, weight: 75, ftp: 250, experience: 'intermediate',
    timeZone: 'Europe/Paris', unitSystem: 'metric', typicalWeeklyHours: 6, maxWeeklyHours: 8,
    availableDays: [0, 2, 4, 6], maxSessionMinutes: {0: 90, 2: 75, 4: 75, 6: 180},
    longRideDay: 6, powerMeter: true, heartRateMonitor: true, smartTrainer: true,
    maxHeartRate: 190, restingHeartRate: 50,
};
export const goal = {
    id: 'goal', name: 'Mountain fondo', type: 'gran_fondo', date: '2026-04-01',
    priority: 'A', active: true, distanceKm: 160, elevationM: 2500, expectedDurationMinutes: 360,
};
export const start = '2026-01-01';
export const timestamp = '2026-01-01T10:00:00Z';
/**
 * Generate a one-hour example ride every other day across the chosen history window, normalized
 * through the real activity parser.
 */
export function history(p = profile, days = 84) {
    return Array.from({length: days}, (_, i) => i).filter(i => i % 2 === 0).map(i => normalizeActivity({
        id: `ride-${i}`, start: `${addDays(start, -i)}T09:00:00Z`,
        duration: 3600, normalizedPower: 165, averagePower: 160, averageHeartRate: 130, rpe: 4,
    }, p));
}
/**
 * Estimate a dated Coach state from the supplied examples so tests exercise the real calculations
 * rather than a hand-written imitation.
 */
export const state = (p = profile, activities = history(p), asOf = start) => estimateState(activities, p, asOf);
/**
 * Create an isolated, in-memory key/value store for one test scenario. Reusing it simulates
 * reopening saved Coach data; it never writes a browser profile.
 */
export function memoryStorage() {
    const values = new Map();
    return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}
