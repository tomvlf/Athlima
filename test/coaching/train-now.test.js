/**
 * Exercises the ad-hoc "Train Now" selector: it must work with or without a plan, ignore today's
 * planned workout, choose recovery under caution/high load, choose a goal-relevant quality session
 * when ready, explain itself, and never mutate the plan or calendar.
 */
import { trainNowWorkout } from '../../src/coaching/train-now.js';
import { addDays } from '../../src/coaching/domain.js';
import { normalizeActivity } from '../../src/coaching/normalizer.js';
import { profile, goal, start, history } from './fixtures.js';

// Stable daily load keeps the acute/chronic ratio near 1 so readiness, not a ramp artefact, decides.
function steadyHistory() {
    return Array.from({length: 84}, (_, i) => normalizeActivity({
        id: `steady-${i}`, start: `${addDays(start, -i)}T09:00:00Z`, duration: 3600,
        normalizedPower: 165, averagePower: 160, averageHeartRate: 130, rpe: 4,
    }, profile));
}

function data(overrides = {}) {
    return {
        profile, goal, activities: steadyHistory(), snapshots: [], safetyStatus: null,
        plan: {
            status: 'active', coachingConfig: undefined, phases: [],
            workouts: [{
                id: 'planned-today', date: start, family: 'threshold', title: 'Planned threshold',
                status: 'scheduled', duration: 3600, steps: [{duration: 3600, power: 0.9}],
            }],
            ...overrides.plan,
        },
        ...overrides,
    };
}

test('generates a goal-relevant quality session when ready and ignores today\'s plan', () => {
    const input = data();
    const before = JSON.stringify(input);
    const result = trainNowWorkout({data: input, asOf: start});
    expect(result.workout.id).not.toBe('planned-today');
    expect(['threshold', 'aerobic', 'sprint']).toContain(result.workout.family);
    expect(result.workout.duration).toBeGreaterThanOrEqual(25 * 60);
    expect(result.workout.trainNow.reasoning).toContain('independently of today\'s calendar');
    expect(result.signals.ignoredPlannedWorkout).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
});

test('uses today\'s session limit, capped by the recent longest session', () => {
    const result = trainNowWorkout({data: data(), asOf: start});
    // Thursday allows 75 minutes; the recent longest session is 60, so the spike cap keeps it at 75.
    expect(result.workout.duration).toBe(75 * 60);
});

test('chooses recovery when subjective readiness reaches caution', () => {
    const rides = history(profile).map(ride => ride.id === 'ride-0' ? normalizeActivity({
        id: ride.id, start: ride.start, duration: 3600, normalizedPower: 250, averagePower: 240,
        averageHeartRate: 160, rpe: 10, feedback: {legFreshness: 1, sleepQuality: 1, muscleSoreness: 5, stress: 5},
    }, profile) : ride);
    const result = trainNowWorkout({data: data({activities: rides}), asOf: start});
    expect(result.workout.family).toBe('recovery');
    expect(result.signals.readiness).toBe('caution');
    expect(result.workout.trainNow.reasoning).toMatch(/caution threshold|recent load/);
});

test('chooses recovery when recent load is well above the longer baseline', () => {
    const hard = [1, 2, 3].map(i => normalizeActivity({
        id: `hard-${i}`, start: `${addDays(start, -i)}T09:00:00Z`, duration: 7200,
        normalizedPower: 250, averagePower: 245, averageHeartRate: 165, rpe: 8,
    }, profile));
    const result = trainNowWorkout({data: data({activities: [...history(profile), ...hard]}), asOf: start});
    expect(result.signals.acuteRatio).toBeGreaterThan(1.3);
    expect(result.workout.family).toBe('recovery');
});

test('backs off quality when recent perceived exertion is trending upward', () => {
    const rides = steadyHistory().map((ride, i) => i < 4
        ? normalizeActivity({id: ride.id, start: ride.start, duration: 3600, normalizedPower: 165,
            averagePower: 160, averageHeartRate: 150, rpe: 8}, profile) : ride);
    const result = trainNowWorkout({data: data({activities: rides}), asOf: start});
    expect(result.workout.family).toBe('endurance');
    expect(result.workout.trainNow.reasoning).toMatch(/perceived exertion/i);
});

test('stays aerobic when history is insufficient for a hard prescription', () => {
    const result = trainNowWorkout({data: data({activities: [], plan: null}), asOf: start});
    expect(result.signals.sufficiency).toBe('insufficient');
    expect(result.workout.family).toBe('endurance');
    expect(result.workout.trainNow.reasoning).toMatch(/endurance|conservative/i);
});

test('works without an active plan or goal', () => {
    const result = trainNowWorkout({data: {profile, goal: null, plan: null, activities: history(profile),
        snapshots: [], safetyStatus: null}, asOf: start});
    expect(result.workout.trainNow.reasoning).toContain('independently of today\'s calendar');
    expect(result.signals.goal).toBeNull();
});

test('refuses missing profiles, running profiles, missing FTP and safety pauses', () => {
    expect(() => trainNowWorkout({data: {activities: []}, asOf: start})).toThrow(/profile/i);
    expect(() => trainNowWorkout({data: {...data(), profile: {...profile, sport: 'running'}}, asOf: start}))
        .toThrow(/indoor cycling/i);
    expect(() => trainNowWorkout({data: {...data(), profile: {...profile, ftp: null}}, asOf: start}))
        .toThrow(/FTP/i);
    expect(() => trainNowWorkout({data: {...data(), safetyStatus: 'pain'}, asOf: start}))
        .toThrow(/paused/i);
});
