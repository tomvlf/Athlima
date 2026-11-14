/*
 * workouts.js: front-end client module.
 *
 * Why this exists:
 * This file is part of Athlima and is kept separate so the application can be understood
 * as a set of focused responsibilities instead of one large unstructured script.
 * The code here is intentionally organized around one job so a new contributor can
 * follow the data flow and the reason for each step without reading unrelated code.
 *
 * What it does:
 * models training load, planning logic, and adaptation rules used to generate and explain workouts.
 *
 * Developer note:
 * Read this file as the boundary of the problem it solves: inputs, transformations,
 * persistence, and outputs. If a change affects the behaviour of this module, update
 * the tests and the surrounding callers in the same review.
 */

import { VERSION, DEFAULTS, sum, round, sportOf, validateCoachingConfig } from './domain.js';
import { explainWorkout } from './explanations.js';
import { powerAccumulator } from './power.js';
import { RUN_FAMILIES, RUN_TITLES, STRIDE, runSteps } from './running.js';

export const FAMILIES = Object.freeze({
    endurance: {power: 0.65, rpe: 3, hard: false},
    recovery: {power: 0.5, rpe: 2, hard: false},
    threshold: {power: 0.95, rpe: 7, hard: true},
    aerobic: {power: 1.1, rpe: 8, hard: true},
    sprint: {power: 1.3, rpe: 8, hard: true},
    durability: {power: 0.65, rpe: 4, hard: false},
});

/** Family intensity/RPE for a sport; both sports share family keys and hard/easy classification. */
export const familySpec = (family, sport = 'cycling') => (sport === 'running' ? RUN_FAMILIES : FAMILIES)[family];

export function stepLoad(steps) {
    const calculation = powerAccumulator();
    steps.forEach(step => calculation.add(step.power, step.duration));
    const expectedIntensity = calculation.value();
    if(expectedIntensity == null) throw new Error('At least 30 prescribed seconds are required to estimate power load.');
    return sum(steps.map(s => s.duration)) / 3600 * expectedIntensity ** 2 * 100;
}

function validateSlot({minutes, family, level = 1}, rules) {
    if(!FAMILIES[family] || !Number.isInteger(minutes) ||
       minutes < rules.minimumSessionMinutes || !Number.isInteger(level) ||
       level < 1 || level > rules.progressionMaximumLevel) {
        throw new Error('Invalid workout family, duration or progression level.');
    }
}

/**
 * Wraps prescribed steps in the planner's workout record.
 *
 * @param {object} args - Slot fields plus `steps`, and optionally `title`, `description` and `library`.
 * @returns {object} A scheduled coaching workout.
 */
export function buildWorkout({id, date, family, steps, level = 1, phaseId, weekId, phaseType,
    profile, title, description, library = null, runFormat: requestedFormat = null}) {
    const sport = sportOf(profile);
    const spec = familySpec(family, sport);
    const seconds = sum(steps.map(s => s.duration));
    // Describe what the steps contain, not what the slot requested (fallbacks may drop strides or walks).
    const runFormat = sport === 'running' && requestedFormat ? {
        runWalk: requestedFormat.runWalk && !spec.hard ? [...requestedFormat.runWalk] : null,
        strides: spec.hard ? 0 : steps.filter(s => s.power === STRIDE).length,
    } : null;
    const reason = explainWorkout(family, phaseType, level, sport, runFormat);
    const name = sport === 'running'
        ? runFormat?.runWalk && !spec.hard ? 'Run-walk' : RUN_TITLES[family]
        : `${family[0].toUpperCase()}${family.slice(1)}`;
    return {
        id, externalId: id, date, family, type: spec.hard ? 'intervals' : 'steady',
        ...(sport === 'running' ? {sport, runFormat} : {}),
        title: title || `${name} ${Math.round(seconds / 60)} min`,
        description: description || reason, reason,
        purpose: family, duration: seconds, targetLoad: round(stepLoad(steps)),
        targetIntensity: Math.sqrt(stepLoad(steps) / (seconds / 3600 * 100)),
        steps, suitability: ['indoor', 'outdoor'],
        environment: profile.dayPreferences?.[new Date(`${date}T00:00:00Z`).getUTCDay()] || 'either',
        priority: spec.hard || family === 'durability' ? 'high' : 'normal',
        required: spec.hard || family === 'durability',
        phaseId, weekId, progressionLevel: level, expectedRpe: spec.rpe,
        libraryWorkoutId: library?.id ?? null, libraryName: library?.name ?? null,
        libraryAdjustments: library?.adjustments ?? [],
        libraryRationale: library?.rationale ?? null,
        status: 'scheduled', matchedActivity: null, matchConfidence: null, completionQuality: null,
        adaptationNotes: [], plannerVersion: VERSION,
    };
}

export function progressWorkout(args) {
    const config = validateCoachingConfig(args.rules);
    validateSlot(args, config);
    const {minutes, level = 1} = args;
    let {family} = args;
    if(sportOf(args.profile) === 'running') {
        if(RUN_FAMILIES[family].hard && minutes < config.minimumHardSessionMinutes) family = 'endurance';
        let steps = runSteps({...args, family}, config);
        if(!steps) {
            family = 'endurance';
            steps = runSteps({...args, family}, config);
        }
        return buildWorkout({...args, family, steps});
    }
    if(FAMILIES[family].hard && minutes < config.minimumHardSessionMinutes) family = 'endurance';
    if(FAMILIES[family].power > config.libraryMaximumPower) {
        family = FAMILIES.endurance.power <= config.libraryEnduranceMaximumPower ? 'endurance' : 'recovery';
    }
    const spec = FAMILIES[family];
    const seconds = minutes * 60;
    let steps;
    if(spec.hard && minutes >= config.minimumHardSessionMinutes) {
        const repetitions = 3;
        const on = family === 'sprint' ? 10 + (level - 1) * 5
            : Math.min(family === 'aerobic' ? 180 : 300, 60 + (level - 1) * 30,
                Math.floor(seconds * config.libraryMaximumHardTimeShare / repetitions));
        const off = 120;
        steps = [{duration: 300, power: 0.5}];
        for(let i = 0; i < repetitions; i++) {
            steps.push({duration: on, power: spec.power}, {duration: off, power: 0.5});
        }
        steps.push({duration: seconds - sum(steps.map(s => s.duration)) - 300, power: 0.65},
            {duration: 300, power: 0.5});
        steps = steps.filter(s => s.duration > 0);
    } else {
        family = spec.hard ? 'endurance' : family;
        steps = [{duration: seconds, power: FAMILIES[family].power}];
    }
    return buildWorkout({...args, family, steps});
}

export function toAppWorkout(workout) {
    return {
        id: workout.id, coachingWorkoutId: workout.id,
        meta: {name: workout.title, description: workout.description, author: workout.libraryName ? 'Athlima workout library, adjusted by the Coach' : 'Athlima deterministic coach',
            category: workout.family, startDateLocal: workout.date, duration: workout.duration},
        intervals: workout.steps.map(step => ({duration: step.duration, steps: [{...step}]})),
    };
}

export function exportZwo(workout) {
    const escape = value => String(value).replace(/[&<>"']/g, c =>
        ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
    // Zwift run steps scale a reference race pace; pace="2" (10 km) approximates threshold pace.
    const run = workout.sport === 'running';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file><author>Athlima</author>` +
        `<name>${escape(workout.title)}</name><description>${escape(workout.description)}</description>` +
        `<sportType>${run ? 'run' : 'bike'}</sportType><workout>` +
        workout.steps.map(s => `<SteadyState Duration="${s.duration}" Power="${s.power}"${run ? ' pace="2"' : ''}${Number.isFinite(s.cadence) ? ` Cadence="${s.cadence}"` : ''}/>`).join('') +
        '</workout></workout_file>';
}
