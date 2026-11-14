/*
 * running.js: running-specific prescription rules for the deterministic coach.
 *
 * Why this exists:
 * Running shares the planner's periodisation, load envelopes and capability families with
 * cycling, but it needs its own intensity anchors (threshold pace instead of FTP), its own
 * session formats (cruise intervals, VO2max intervals, repetitions, strides, run-walk) and
 * running-specific safety caps. Keeping those rules here leaves the planner sport-neutral.
 *
 * What it does:
 * - Run family intensities are fractions of threshold SPEED (1000 / threshold pace in s/km),
 *   so the planner's load maths (hours x intensity^2 x 100) yields an rTSS-like estimate.
 * - Quality sessions follow Daniels-style weekly caps: threshold <=10%, interval <=8% and
 *   repetition <=5% of weekly running time (time is used as the proxy for mileage).
 * - Riegel (1981) T2 = T1 x (D2 / D1)^1.06 converts race results into a threshold pace.
 *
 * Developer note:
 * This module must not import workouts.js or planner.js (they import it). Update
 * doc/coaching.md and test/coaching/running.test.js when changing a rule.
 */

import { DEFAULTS, sum } from './domain.js';

export const RUN_FAMILIES = Object.freeze({
    endurance: {power: 0.8, rpe: 3, hard: false},
    recovery: {power: 0.72, rpe: 2, hard: false},
    threshold: {power: 0.98, rpe: 7, hard: true},
    aerobic: {power: 1.07, rpe: 8, hard: true},
    sprint: {power: 1.15, rpe: 7, hard: true},
    durability: {power: 0.8, rpe: 4, hard: false},
});
export const RUN_TITLES = Object.freeze({
    endurance: 'Easy run', recovery: 'Recovery run', threshold: 'Threshold run',
    aerobic: 'VO2max intervals', sprint: 'Speed repetitions', durability: 'Long run',
});
export const RUN_JOG = 0.7;
export const RUN_WARMUP = 0.75;
export const RUN_WALK = 0.5;
export const STRIDE = 1.15;
// [run seconds, walk seconds]; each stage lasts runWalkStageWeeks plan weeks.
export const RUN_WALK_STAGES = Object.freeze([[60, 90], [90, 60], [120, 60], [180, 60], [300, 60], [480, 60]]);

const QUALITY = Object.freeze({
    threshold: {on: [300, 300, 480, 480, 600], reps: [3, 4, 3, 4, 3], rest: on => Math.max(60, Math.round(on / 5)),
        share: 'runThresholdWeeklyShare'},
    aerobic: {on: [120, 120, 180, 180, 240], reps: [4, 5, 4, 5, 4], rest: on => on, share: 'runIntervalWeeklyShare'},
    sprint: {on: [45, 60, 60, 75, 90], reps: [6, 6, 8, 8, 8], rest: on => on * 2, share: 'runRepetitionWeeklyShare'},
});

/** Checks each quality family's total across the week, not just each individual session. */
export function runQualityExcess(workouts, weeklyMinutes, rules = DEFAULTS) {
    return Object.entries(QUALITY).filter(([family, quality]) => {
        const seconds = sum(workouts.filter(w => w.family === family)
            .flatMap(w => w.steps.filter(s => s.power > rules.hardPowerThreshold)).map(s => s.duration));
        return seconds > weeklyMinutes * 60 * rules[quality.share] + 0.01;
    }).map(([family]) => family);
}

/**
 * Riegel (1981) endurance model.
 *
 * @returns {number} Predicted time in the same unit as `time`.
 */
export const riegelTime = (time, distance, targetDistance, exponent = DEFAULTS.riegelExponent) =>
    time * (targetDistance / distance) ** exponent;

/**
 * Estimates threshold pace as the pace a runner could race for 60 minutes (Daniels "T" pace).
 *
 * @param {number} distanceKm - Recent race or all-out time-trial distance.
 * @param {number} seconds - Finish time in seconds.
 * @returns {number|null} Threshold pace in seconds per kilometre, rounded to whole seconds.
 */
export function thresholdPaceFromRace(distanceKm, seconds, exponent = DEFAULTS.riegelExponent) {
    if(!(distanceKm > 0) || !(seconds > 0)) return null;
    const hourDistance = distanceKm * (3600 / seconds) ** (1 / exponent);
    return Math.round(3600 / hourDistance);
}

/**
 * Predicts a finish time from threshold pace with Riegel's exponent; optimistic beyond the
 * half marathon (Vickers & Vertosick 2016), so callers must label it low confidence.
 */
export function predictedRaceSeconds(thresholdPace, distanceKm, exponent = DEFAULTS.riegelExponent) {
    if(!(thresholdPace > 0) || !(distanceKm > 0)) return null;
    return riegelTime(3600, 3600 / thresholdPace, distanceKm, exponent);
}

export const paceForIntensity = (thresholdPace, intensity) => thresholdPace / intensity;

export function formatPace(secondsPerKm, unitSystem = 'metric') {
    if(!(secondsPerKm > 0)) return '';
    const value = Math.round(unitSystem === 'imperial' ? secondsPerKm * 1.609344 : secondsPerKm);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}/${unitSystem === 'imperial' ? 'mi' : 'km'}`;
}

export function parsePace(text) {
    const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(String(text ?? ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const PACE_LABELS = [[STRIDE, 'strides/repetitions'], [RUN_FAMILIES.aerobic.power, 'intervals'],
    [RUN_FAMILIES.threshold.power, 'threshold'], [RUN_FAMILIES.endurance.power, 'easy'], [RUN_WARMUP, 'warm-up'],
    [RUN_FAMILIES.recovery.power, 'recovery'], [RUN_JOG, 'jog'], [0, 'walk']];

/**
 * Pace guide for a run, fastest first, e.g. "threshold 4:42/km, easy 5:45/km".
 *
 * @returns {string} Empty when threshold pace is unknown.
 */
export function describeRunPaces(steps, thresholdPace, unitSystem = 'metric') {
    if(!(thresholdPace > 0)) return '';
    const seen = new Map();
    for(const power of [...new Set(steps.map(s => s.power))].sort((a, b) => b - a)) {
        const name = PACE_LABELS.find(([minimum]) => power >= minimum - 1e-9)[1];
        if(!seen.has(name)) seen.set(name, `${name} ${formatPace(paceForIntensity(thresholdPace, power), unitSystem)}`);
    }
    return [...seen.values()].join(', ');
}

/**
 * Selects a run-walk stage for runners whose longest recent run is below the continuous-running threshold.
 *
 * @param {number} longestMinutes - Longest run in the reference window.
 * @param {number} weekIndex - Zero-based plan week.
 * @returns {number[]|null} `[runSeconds, walkSeconds]`, or null for continuous running.
 */
export function runWalkStage(longestMinutes, weekIndex, rules = DEFAULTS) {
    if(longestMinutes >= rules.runWalkThresholdMinutes) return null;
    const start = longestMinutes < 10 ? 0 : longestMinutes < 20 ? 2 : 4;
    const stage = start + Math.floor(weekIndex / rules.runWalkStageWeeks);
    return stage < RUN_WALK_STAGES.length ? [...RUN_WALK_STAGES[stage]] : null;
}

function runWalkSteps(seconds, [run, walk], power) {
    const steps = [];
    let remaining = seconds;
    if(remaining >= 300 + run + walk) {
        steps.push({duration: 300, power: RUN_WALK});
        remaining -= 300;
    }
    while(remaining >= run + walk) {
        steps.push({duration: run, power}, {duration: walk, power: RUN_WALK});
        remaining -= run + walk;
    }
    if(remaining > 0) steps.push({duration: remaining, power: steps.length ? RUN_WALK : power});
    return steps;
}

/**
 * Generates the steps of one run. Step `power` is a fraction of threshold speed.
 *
 * @param {object} slot - `{family, minutes, level, weeklyMinutes, runFormat}`.
 * @returns {Array<object>|null} Steps whose durations sum to the slot, or null when a quality
 *     session cannot fit two repetitions inside the session and the weekly quality cap.
 */
export function runSteps({family, minutes, level = 1, weeklyMinutes = null, runFormat = null}, rules = DEFAULTS) {
    const seconds = minutes * 60;
    const spec = RUN_FAMILIES[family];
    if(runFormat?.runWalk) return spec.hard ? null : runWalkSteps(seconds, runFormat.runWalk, spec.power);
    if(spec.hard) {
        const quality = QUALITY[family];
        const index = Math.min(level, quality.on.length) - 1;
        const on = quality.on[index], rest = quality.rest(on);
        const warmup = 600, cooldown = seconds >= 3000 ? 600 : 300;
        const weeklyCap = Number.isFinite(weeklyMinutes) ? weeklyMinutes * 60 * rules[quality.share] : Infinity;
        const reps = Math.min(quality.reps[index], Math.floor(weeklyCap / on),
            Math.floor((seconds - warmup - cooldown) / (on + rest)));
        if(reps < 2) return null;
        const steps = [{duration: warmup, power: RUN_WARMUP}];
        for(let i = 0; i < reps; i++) steps.push({duration: on, power: spec.power}, {duration: rest, power: RUN_JOG});
        const easy = seconds - sum(steps.map(s => s.duration)) - cooldown;
        if(easy > 0) steps.push({duration: easy, power: RUN_FAMILIES.endurance.power});
        steps.push({duration: cooldown, power: RUN_JOG});
        return steps;
    }
    const strides = family === 'endurance' ? runFormat?.strides || 0 : 0;
    if(strides && seconds >= 1200 + strides * 80) {
        const steps = [{duration: seconds - strides * 80 - 120, power: spec.power}];
        for(let i = 0; i < strides; i++) steps.push({duration: 20, power: STRIDE}, {duration: 60, power: RUN_JOG});
        steps.push({duration: 120, power: spec.power});
        return steps;
    }
    return [{duration: seconds, power: spec.power}];
}
