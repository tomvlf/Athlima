/**
 * Pure helpers for the simplified daily Coach entry point.
 *
 * This module validates and normalizes quick goal input, but never creates a persistent
 * quick-goal model or replaces the existing Coach plan/state chain.
 */

import { GOALS, RUN_GOALS, addDays, date, goalRegistry, validateGoal, validateProfile } from './domain.js';

export const DAILY_GOAL_LABELS = Object.freeze({
    general_fitness: 'General fitness',
    ftp_improvement: 'Improve FTP',
    gran_fondo: 'Gran fondo',
    cycling_sprint: 'Cycling sprint',
    long_distance_completion: 'Long-distance ride',
    general_running: 'General running',
    first_5k: 'First 5 km',
    run_5k: '5 km',
    run_10k: '10 km',
    half_marathon: 'Half marathon',
    marathon: 'Marathon',
    ultra_trail: 'Ultra / trail',
});

export const DAILY_HORIZONS = Object.freeze([
    {days: 42, label: 'In about 6 weeks'},
    {days: 91, label: 'Within 3 months'},
    {days: 182, label: 'Within 6 months'},
    {days: 365, label: 'Within 1 year'},
]);

/** Return existing supported goal types for one sport. */
export function quickGoalTypes(sport) {
    return Object.keys(sport === 'running' ? RUN_GOALS : GOALS);
}

/** Normalize a three-choice daily goal and reject invalid timeline input. */
export function normalizeQuickGoal({sport, type, horizon, date: requestedDate, today}) {
    if(!['cycling', 'running'].includes(sport)) throw new Error('Choose cycling or running.');
    const registry = goalRegistry(sport);
    if(!Object.hasOwn(registry, type)) throw new Error('Choose a supported goal for the selected sport.');
    const start = date(today);
    let targetDate;
    if(requestedDate) {
        targetDate = date(requestedDate);
    } else {
        const days = Number(horizon);
        if(!DAILY_HORIZONS.some(option => option.days === days)) {
            throw new Error('Choose a valid timeline.');
        }
        targetDate = addDays(start, days);
    }
    if(targetDate <= start) throw new Error('The goal date must be after today.');
    if(targetDate > addDays(start, 365)) throw new Error('The goal date must be within one year.');
    const goal = {
        id: `${sport}-goal`,
        name: DAILY_GOAL_LABELS[type] || type,
        type,
        priority: 'A',
        date: targetDate,
        active: true,
    };
    validateGoal(goal, start, registry);
    return goal;
}

/** Preserve existing profile fields and change only the selected sport. */
export function quickProfile(profile, sport) {
    if(!profile) return null;
    return {...JSON.parse(JSON.stringify(profile)), sport};
}

/** Identify profile fields that prevent a safe quick-plan creation. */
export function missingQuickProfileFields(profile) {
    if(!profile) return ['athlete profile', 'body weight', 'experience', 'weekly availability', 'adult confirmation'];
    const missing = [];
    if(!profile.weight) missing.push('body weight');
    if(!['beginner', 'intermediate', 'advanced'].includes(profile.experience)) missing.push('experience');
    if(!Array.isArray(profile.availableDays) || !profile.availableDays.length ||
       !profile.maxSessionMinutes || !Object.values(profile.maxSessionMinutes).some(value => value > 0)) {
        missing.push('weekly availability');
    }
    if(profile.typicalWeeklyHours == null || profile.maxWeeklyHours == null) missing.push('weekly hours');
    if(profile.adultAthleteConfirmed !== true) missing.push('adult confirmation');
    if(profile.timeZone) {
        try { validateProfile(profile); } catch(error) { missing.push(error.message); }
    }
    return [...new Set(missing)];
}
