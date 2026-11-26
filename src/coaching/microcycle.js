/** Projects the existing Coach plan into a short, read-only planning window. */

import { addDays, date } from './domain.js';
import { FAMILIES } from './workouts.js';

/** Default number of calendar days in a microcycle projection. */
export const MICROCYCLE_DAYS = 7;
/** Existing workout families mapped to presentation roles in microcycle views. */
export const MICROCYCLE_ROLES = Object.freeze({recovery: 'recovery', endurance: 'endurance', tempo: 'quality',
    sweetspot: 'quality', threshold: 'quality', aerobic: 'quality', vo2: 'quality', anaerobic: 'quality',
    sprint: 'quality', technique: 'technique', long: 'long'});

/**
 * Map a workout to a stable microcycle presentation role.
 *
 * @param {object} workout - Existing Coach workout.
 * @returns {'recovery'|'endurance'|'quality'|'technique'|'long'|'maintenance'} Microcycle role.
 */
export function microcycleRole(workout) {
    if(workout.role === 'long' || workout.long === true) return 'long';
    if(MICROCYCLE_ROLES[workout.family]) return MICROCYCLE_ROLES[workout.family];
    if(FAMILIES[workout.family]?.hard) return 'quality';
    return 'maintenance';
}

/**
 * Project an existing Coach plan into a bounded, read-only-compatible calendar window.
 *
 * @param {object} input - Projection inputs.
 * @param {object} input.plan - Existing generated or adapted Coach plan.
 * @param {object} input.state - Dated athlete-state snapshot used by the plan.
 * @param {string} input.fromDate - First included date in YYYY-MM-DD format.
 * @param {number} [input.days=7] - Included calendar days, from 1 through 14.
 * @returns {object} Deterministic projection referencing existing workout identities.
 * @throws {Error} When the plan, state, date or day count is invalid.
 */
export function projectMicrocycle({plan, state, fromDate, days = MICROCYCLE_DAYS}) {
    const startDate = date(fromDate);
    if(!plan || !Array.isArray(plan.workouts)) throw new Error('A Coach plan with workouts is required.');
    if(!state || typeof state !== 'object') throw new Error('A dated Coach state snapshot is required.');
    if(!Number.isInteger(days) || days < 1 || days > 14) throw new Error('Microcycle projection must cover 1-14 days.');
    const endDate = addDays(startDate, days - 1);
    const sessions = plan.workouts.filter(workout => workout.date >= startDate && workout.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
        .map(workout => ({workoutId: workout.id, date: workout.date, family: workout.family,
            role: microcycleRole(workout), status: workout.status, duration: workout.duration,
            scheduledLoad: workout.targetLoad ?? workout.scheduledLoad ?? workout.load ?? null,
            phaseId: workout.phaseId ?? null, weekId: workout.weekId ?? null}));
    return {planId: plan.id, revision: plan.revision, stateId: state.id, startDate, endDate, days, sessions,
        warnings: [...(plan.validationWarnings || []), ...(state.warnings || [])]};
}
