/**
 * Projects the existing Coach plan into a short, read-only planning window. A microcycle is not a
 * second persisted plan: it references existing workouts and the dated state snapshot that informed
 * the plan. Future adaptive planning can replace the selection policy behind this boundary without
 * duplicating CoachingService, plan revisions, workout matching or storage.
 */

import { addDays, date } from './domain.js';
import { FAMILIES } from './workouts.js';

export const MICROCYCLE_DAYS = 7;

/**
 * Map existing workout families to broad session roles. Families remain the authoritative training
 * vocabulary; roles are presentation and scheduling hints for the microcycle layer.
 */
export const MICROCYCLE_ROLES = Object.freeze({
    recovery: 'recovery',
    endurance: 'endurance',
    tempo: 'quality',
    sweetspot: 'quality',
    threshold: 'quality',
    aerobic: 'quality',
    vo2: 'quality',
    anaerobic: 'quality',
    sprint: 'quality',
    technique: 'technique',
    long: 'long',
});

/**
 * Derive a stable role from the existing family registry instead of introducing a second stimulus
 * enum. Unknown families remain maintenance sessions and are surfaced explicitly to callers.
 */
export function microcycleRole(workout) {
    if(workout.role === 'long' || workout.long === true) return 'long';
    if(MICROCYCLE_ROLES[workout.family]) return MICROCYCLE_ROLES[workout.family];
    if(FAMILIES[workout.family]?.hard) return 'quality';
    return 'maintenance';
}

/**
 * Return a deterministic seven-day projection of an existing plan.
 *
 * @param {object} input - Projection inputs.
 * @param {object} input.plan - Existing generated or adapted Coach plan.
 * @param {object} input.state - Existing estimateState snapshot.
 * @param {string} input.fromDate - First included calendar date in YYYY-MM-DD format.
 * @param {number} [input.days=7] - Number of projected calendar days.
 * @returns {object} Read-only-compatible projection with references to existing workout identities.
 */
export function projectMicrocycle({plan, state, fromDate, days = MICROCYCLE_DAYS}) {
    const startDate = date(fromDate);
    if(!plan || !Array.isArray(plan.workouts)) throw new Error('A Coach plan with workouts is required.');
    if(!state || typeof state !== 'object') throw new Error('A dated Coach state snapshot is required.');
    if(!Number.isInteger(days) || days < 1 || days > 14) {
        throw new Error('Microcycle projection must cover 1-14 days.');
    }
    const endDate = addDays(startDate, days - 1);
    const sessions = plan.workouts
        .filter(workout => workout.date >= startDate && workout.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
        .map(workout => ({
            workoutId: workout.id,
            date: workout.date,
            family: workout.family,
            role: microcycleRole(workout),
            status: workout.status,
            duration: workout.duration,
            scheduledLoad: workout.scheduledLoad ?? workout.load ?? null,
            phaseId: workout.phaseId ?? null,
            weekId: workout.weekId ?? null,
        }));
    return {
        planId: plan.id,
        revision: plan.revision,
        stateId: state.id,
        startDate,
        endDate,
        days,
        sessions,
        warnings: [
            ...(plan.validationWarnings || []),
            ...(state.warnings || []),
        ],
    };
}
