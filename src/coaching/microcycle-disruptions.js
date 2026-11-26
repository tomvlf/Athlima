/**
 * Applies temporary availability constraints to an already validated candidate plan. Disruptions are
 * scoped to the review window, only reduce or remove scheduled work, preserve workout identity when
 * shortening, and never move missed volume to another day.
 */

import { sum, round } from './domain.js';
import { progressWorkout } from './workouts.js';

/** Clone JSON-compatible plans before applying bounded temporary disruptions. */
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Validate and normalise rider-supplied temporary constraints.
 *
 * @param {object} [disruptions] - Unavailable dates, per-day limits and optional note.
 * @param {object} window - Inclusive microcycle review window.
 * @returns {object} Normalised disruption input.
 * @throws {Error} When a date or minute limit falls outside the accepted bounds.
 */
export function normalizeDisruptions(disruptions = {}, window) {
    const unavailableDates = [...new Set(disruptions.unavailableDates || [])].sort();
    const maxMinutesByDate = Object.fromEntries(Object.entries(disruptions.maxMinutesByDate || {})
        .map(([day, minutes]) => [day, Number(minutes)]));
    for(const day of unavailableDates) {
        if(day < window.startDate || day > window.endDate) throw new Error('Unavailable dates must fall inside the review window.');
    }
    for(const [day, minutes] of Object.entries(maxMinutesByDate)) {
        if(day < window.startDate || day > window.endDate || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
            throw new Error('Temporary session limits must be whole minutes inside the review window.');
        }
    }
    return {unavailableDates, maxMinutesByDate,
        note: String(disruptions.note || '').trim().slice(0, 240)};
}

/**
 * Apply conservative availability changes to an already validated candidate plan.
 *
 * @param {object} input - Disruption inputs.
 * @param {object} input.plan - Candidate Coach plan.
 * @param {object} input.profile - Athlete profile.
 * @param {object} input.state - Current athlete-state snapshot.
 * @param {object} input.window - Inclusive review window.
 * @param {object} input.disruptions - Rider disruption constraints.
 * @returns {object} Updated plan and recorded disruption changes.
 * @throws {Error} When disruption values are invalid.
 */
export function applyMicrocycleDisruptions({plan, profile, state, window, disruptions}) {
    const normalized = normalizeDisruptions(disruptions, window);
    const next = clone(plan), changes = [];
    const unavailable = new Set(normalized.unavailableDates);
    for(const workout of [...next.workouts]) {
        if(workout.status !== 'scheduled' || workout.date < window.startDate || workout.date > window.endDate) continue;
        const limit = unavailable.has(workout.date) ? 0 : normalized.maxMinutesByDate[workout.date];
        if(limit == null || limit * 60 >= workout.duration) continue;
        const previous = clone(workout);
        if(limit < state.config.minimumSessionMinutes) {
            next.workouts = next.workouts.filter(candidate => candidate.id !== workout.id);
            changes.push({id: workout.id, action: 'removed', previous, current: null,
                reason: unavailable.has(workout.date) ? 'Temporarily unavailable.' : 'Temporary time limit is below the minimum session duration.'});
            continue;
        }
        const week = next.weeks.find(candidate => candidate.id === workout.weekId);
        const modified = progressWorkout({id: workout.id, date: workout.date, minutes: limit,
            family: workout.family, level: workout.progressionLevel, phaseId: workout.phaseId,
            weekId: workout.weekId, phaseType: week?.phaseType, profile, rules: state.config,
            weeklyMinutes: week?.targetMinutes, runFormat: workout.runFormat});
        modified.original = workout.original ?? {family: workout.family, duration: workout.duration,
            targetLoad: workout.targetLoad, progressionLevel: workout.progressionLevel,
            libraryWorkoutId: workout.libraryWorkoutId ?? null};
        modified.adaptationNotes = [...(workout.adaptationNotes || []),
            `Shortened to ${limit} minutes for a temporary availability limit.`];
        Object.assign(workout, modified);
        changes.push({id: workout.id, action: 'modified', previous, current: clone(workout),
            reason: `Temporary availability limit of ${limit} minutes.`});
    }
    for(const week of next.weeks) {
        const members = next.workouts.filter(workout => workout.weekId === week.id &&
            !['missed', 'failed'].includes(workout.status));
        week.scheduledMinutes = sum(members.map(workout => workout.duration / 60));
        week.scheduledLoad = round(sum(members.map(workout => workout.targetLoad)));
    }
    if(changes.length) {
        const adaptation = next.adaptations.at(-1);
        adaptation.changes.push(...changes);
        adaptation.reasoning += ` Temporary availability removed or shortened ${changes.length} session${changes.length === 1 ? '' : 's'}; omitted work is not moved or made up.`;
        if(normalized.note) adaptation.observations.disruptionNote = normalized.note;
    }
    return {plan: next, disruptions: normalized, changes};
}
