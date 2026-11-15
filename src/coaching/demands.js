/*
 * demands.js: front-end client module.
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

import { DEFAULTS, GOALS, CAPABILITIES, sum, metric, sportForGoalType, validateCoachingConfig } from './domain.js';
import { predictedRaceSeconds } from './running.js';

export function modelGoalDemand(goal, registry = GOALS, rules = DEFAULTS) {
    const config = validateCoachingConfig(rules);
    const weights = registry[goal.type];
    if(!weights || weights.length !== CAPABILITIES.length || weights.some(v => !Number.isFinite(v) || v < 0) || !sum(weights)) {
        throw new Error('Goal type needs five nonnegative capability weights.');
    }
    const adjusted = [...weights];
    const running = sportForGoalType(goal.type) === 'running';
    const duration = goal.expectedDurationMinutes ?? (running ? goal.finishTimeMinutes : null);
    if(duration >= (running ? config.runLongEventDurationThreshold : config.longEventDurationThreshold) ||
       goal.distanceKm >= (running ? config.runLongEventDistanceThreshold : config.longEventDistanceThreshold)) {
        adjusted[4] += config.longEventDurabilityWeightBonus;
    }
    if(goal.elevationM >= (running ? config.runClimbingElevationThreshold : config.climbingElevationThreshold) ||
       goal.terrain === 'mountainous') {
        adjusted[1] += config.climbingThresholdWeightBonus;
    }
    return {
        capabilities: Object.fromEntries(CAPABILITIES.map((key, i) => [key, adjusted[i] / sum(adjusted)])),
        sport: running ? 'running' : 'cycling',
        durationMinutes: goal.expectedDurationMinutes ?? goal.finishTimeMinutes ?? null,
        targets: {ftp: goal.targetFTP ?? null, power: goal.targetPower ?? null, wKg: goal.targetWKg ?? null,
            completion: goal.completionObjective ?? null, finishTimeMinutes: goal.finishTimeMinutes ?? null},
        rationale: `${goal.type}: demands weighted by event type, declared duration, distance and terrain; no invented finish-time prediction.`,
    };
}

export function analyzeGaps(state, demand, goal) {
    const duration = demand.durationMinutes;
    const enduranceGap = duration && state.weeklyDuration != null ? Math.max(0, 1 - state.weeklyDuration / duration) : null;
    const running = demand.sport === 'running';
    // Riegel (1981) is optimistic for the marathon (Vickers & Vertosick 2016), so this gap is low confidence.
    const predicted = running && goal.finishTimeMinutes && goal.distanceKm
        ? predictedRaceSeconds(state.thresholdPace?.value, goal.distanceKm, state.config?.riegelExponent) : null;
    // FTP approximates quasi-steady power for about an hour, so event target power is only comparable
    // with it for events of roughly that length; other durations need a power-duration model.
    const hourTargetPower = goal.targetPower && duration >= 40 && duration <= 70 ? goal.targetPower : null;
    const ftpTarget = goal.targetFTP ?? hourTargetPower;
    const ftpGap = running ? predicted ? Math.max(0, 1 - goal.finishTimeMinutes * 60 / predicted) : null
        : ftpTarget && state.ftp.value
            ? Math.max(0, 1 - state.ftp.value / ftpTarget)
            : goal.targetWKg && state.wKg.value ? Math.max(0, 1 - state.wKg.value / goal.targetWKg) : null;
    const gaps = {
        endurance: metric(enduranceGap, 'low', 'Weekly duration versus declared event duration; a planning heuristic only.'),
        threshold: running
            ? metric(ftpGap, 'low', 'Riegel finish-time prediction from threshold pace versus target time; optimistic beyond the half marathon.',
                {predictedMinutes: predicted == null ? null : Math.round(predicted / 60)})
            : metric(ftpGap, state.confidence, 'Declared FTP or W/kg versus explicit target; event target power counts only for events of about an hour.'),
        aerobic: metric(null, 'unavailable', 'No validated aerobic-capacity target comparison.'),
        sprint: metric(null, 'unavailable', 'No validated sprint-capacity target comparison.'),
        durability: metric(null, 'unavailable', 'Observational durability is not a universal capability score.'),
    };
    const priorities = Object.keys(demand.capabilities).map(capability => ({
        capability, weight: demand.capabilities[capability],
        gap: gaps[capability], score: demand.capabilities[capability] * (1 + (gaps[capability].value ?? 0)),
    })).sort((a, b) => b.score - a.score || a.capability.localeCompare(b.capability));
    return {gaps, priorities, rationale: 'Known target gaps increase demand priority; unknown capacity is labelled, not fabricated.'};
}
