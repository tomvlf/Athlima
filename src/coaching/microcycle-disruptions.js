/**
 * Applies temporary availability constraints to an already validated candidate plan. Disruptions are
 * scoped to the review window, only reduce or remove scheduled work, preserve workout identity when
 * shortening, and never move missed volume to another day.
 */

import { sum, round, date } from './domain.js';
import { progressWorkout } from './workouts.js';
import { prescribeWorkout } from './library.js';

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
    const environmentByDate = Object.fromEntries(Object.entries(disruptions.environmentByDate || {})
        .map(([day, environment]) => [day, String(environment)]));
    const notesByDate = Object.fromEntries(Object.entries(disruptions.notesByDate || {})
        .map(([day, note]) => [day, String(note).trim().slice(0, 240)]));
    const validateDate = day => {
        date(day);
        if(day < window.startDate || day > window.endDate) {
            throw new Error('Availability dates must fall inside the review window.');
        }
    };
    for(const day of unavailableDates) {
        validateDate(day);
    }
    for(const [day, minutes] of Object.entries(maxMinutesByDate)) {
        validateDate(day);
        if(!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
            throw new Error('Temporary session limits must be whole minutes inside the review window.');
        }
    }
    for(const [day, environment] of Object.entries(environmentByDate)) {
        validateDate(day);
        if(!['indoor', 'outdoor', 'either'].includes(environment)) {
            throw new Error('Unknown temporary training environment.');
        }
    }
    for(const [day] of Object.entries(notesByDate)) validateDate(day);
    return {unavailableDates, maxMinutesByDate,
        environmentByDate, notesByDate,
        note: String(disruptions.note || '').trim().slice(0, 240)};
}

/**
 * Normalize repeatable UI day rules and reject duplicate dates.
 *
 * @param {Array<object>} rows - One object per entered review day.
 * @param {object} window - Inclusive microcycle review window.
 * @returns {object} Normalized disruption input.
 * @throws {Error} When a date is duplicated or a row is invalid.
 */
export function normalizeDisruptionRows(rows = [], window) {
    const seen = new Set(), unavailableDates = [], maxMinutesByDate = {},
        environmentByDate = {}, notesByDate = {}, note = '';
    for(const row of rows) {
        const day = String(row.date || '').trim();
        if(!day) continue;
        if(seen.has(day)) throw new Error('A date may appear only once in temporary availability rules.');
        seen.add(day);
        if(row.unavailable) unavailableDates.push(day);
        if(row.maxMinutes !== '' && row.maxMinutes != null) {
            maxMinutesByDate[day] = Number(row.maxMinutes);
        }
        if(row.environment && row.environment !== 'either') environmentByDate[day] = row.environment;
        if(String(row.note || '').trim()) notesByDate[day] = String(row.note).trim();
    }
    return normalizeDisruptions({unavailableDates, maxMinutesByDate,
        environmentByDate, notesByDate, note}, window);
}

const environmentVariant = ({workout, profile, state, environment, limit}) => {
    if(!environment || environment === 'either') return workout;
    if(workout.suitability && !workout.suitability.includes(environment)) return null;
    const minutes = limit == null ? workout.duration / 60 : limit;
    if(!Number.isInteger(minutes) || minutes <= 0 || minutes * 60 > workout.duration) return null;
    const variant = prescribeWorkout({
        id: workout.id, date: workout.date, minutes, family: workout.family,
        level: workout.progressionLevel, phaseId: workout.phaseId, weekId: workout.weekId,
        phaseType: workout.phaseType, profile, rules: state.config,
        weeklyMinutes: workout.weeklyMinutes, runFormat: workout.runFormat,
    }, {history: [], prefer: workout.libraryWorkoutId, rules: state.config,
        maxLoad: workout.targetLoad});
    if(!variant.libraryWorkoutId) return null;
    if(variant.duration > workout.duration ||
       variant.targetLoad > workout.targetLoad + 0.01 ||
       variant.progressionLevel > workout.progressionLevel ||
       (variant.targetIntensity ?? 0) > (workout.targetIntensity ?? variant.targetIntensity)) return null;
    variant.environment = environment;
    return variant;
};

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
        const previous = clone(workout);
        const environment = normalized.environmentByDate[workout.date] ?? 'either';
        if(unavailable.has(workout.date)) {
            next.workouts = next.workouts.filter(candidate => candidate.id !== workout.id);
            changes.push({id: workout.id, action: 'removed', previous, current: null,
                reason: 'Temporarily unavailable.'});
            continue;
        }
        const limit = normalized.maxMinutesByDate[workout.date];
        let environmentReason = null;
        if(environment !== 'either' && workout.suitability?.includes(environment)) {
            if(workout.environment !== environment) {
                workout.environment = environment;
                workout.adaptationNotes = [...(workout.adaptationNotes || []),
                    `Temporary environment set to ${environment}.`];
                environmentReason = `Temporary ${environment} environment.`;
            }
        } else if(environment !== 'either') {
            const variant = environmentVariant({workout, profile, state, environment, limit});
            if(!variant) {
                next.workouts = next.workouts.filter(candidate => candidate.id !== workout.id);
                changes.push({id: workout.id, action: 'removed', previous, current: null,
                    reason: `No conservative ${environment} workout variant is available.`});
                continue;
            }
            workout.original = previous.original ?? {family: previous.family, duration: previous.duration,
                targetLoad: previous.targetLoad, progressionLevel: previous.progressionLevel,
                libraryWorkoutId: previous.libraryWorkoutId ?? null};
            Object.assign(workout, variant);
            workout.adaptationNotes = [...(workout.adaptationNotes || []),
                `Replaced with a conservative ${environment} library variant.`];
            environmentReason = `Temporary ${environment} environment variant.`;
        }
        if(limit != null && limit * 60 < workout.duration) {
            if(limit < state.config.minimumSessionMinutes) {
                next.workouts = next.workouts.filter(candidate => candidate.id !== workout.id);
                changes.push({id: workout.id, action: 'removed', previous, current: null,
                    reason: 'Temporary time limit is below the minimum session duration.'});
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
            modified.environment = workout.environment;
            modified.adaptationNotes = [...(workout.adaptationNotes || []),
                `Shortened to ${limit} minutes for a temporary availability limit.`];
            Object.assign(workout, modified);
        }
        if(JSON.stringify(previous) !== JSON.stringify(workout)) {
            const reasons = [environmentReason,
                limit != null && limit * 60 < previous.duration
                    ? `Temporary availability limit of ${limit} minutes.` : null].filter(Boolean);
            changes.push({id: workout.id, action: 'modified', previous, current: clone(workout),
                reason: reasons.join(' ')});
        }
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
        if(Object.keys(normalized.notesByDate).length) {
            adaptation.observations.disruptionNotesByDate = {...normalized.notesByDate};
        }
        if(Object.keys(normalized.environmentByDate).length) {
            adaptation.observations.environmentByDate = {...normalized.environmentByDate};
        }
        if(normalized.unavailableDates.length) {
            adaptation.observations.unavailableDates = [...normalized.unavailableDates];
        }
        if(Object.keys(normalized.maxMinutesByDate).length) {
            adaptation.observations.maxMinutesByDate = {...normalized.maxMinutesByDate};
        }
    }
    return {plan: next, disruptions: normalized, changes};
}
