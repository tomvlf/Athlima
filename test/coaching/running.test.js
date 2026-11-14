/*
 * running.test.js: running-coach rules (run-walk, spike cap, quality caps, pace load, readiness).
 *
 * The rules and their evidence are documented in doc/coaching.md ("Running coach").
 */

import { RUN_GOALS, addDays, sum } from '../../src/coaching/domain.js';
import { generatePlan, validatePlan, qualityReferenceMinutes } from '../../src/coaching/planner.js';
import { adaptPlan, matchWorkout } from '../../src/coaching/adaptation.js';
import { normalizeActivity } from '../../src/coaching/normalizer.js';
import { estimateState } from '../../src/coaching/state.js';
import { STRIDE, thresholdPaceFromRace, parsePace, formatPace, describeRunPaces } from '../../src/coaching/running.js';
import { exportZwo, FAMILIES } from '../../src/coaching/workouts.js';
import { profile, goal as rideGoal, start, timestamp, state as rideState } from './fixtures.js';

const runner = {...profile, sport: 'running', ftp: null, thresholdPace: 300, powerMeter: false, smartTrainer: false,
    availableDays: [1, 3, 5, 6], maxSessionMinutes: {1: 60, 3: 60, 5: 60, 6: 120}, longRideDay: 6,
    typicalWeeklyHours: 5, maxWeeklyHours: 6};
const novice = {...runner, experience: 'beginner'};
delete novice.thresholdPace;
// Easy runs at 80% of threshold speed every other day, with a longer run every two weeks.
const runHistory = (p = runner) => Array.from({length: 84}, (_, i) => i).filter(i => i % 2 === 0).map(i => {
    const duration = i % 14 === 0 ? 4800 : 2700;
    return normalizeActivity({id: `run-${i}`, sport: 'running', start: `${addDays(start, -i - 1)}T07:00:00Z`,
        duration, distance: Math.round(duration * 1000 / p.thresholdPace * 0.8), averageHeartRate: 140, rpe: 3}, p);
});
const runGoal = {id: 'run-goal', name: 'Spring 10 km', type: 'run_10k', date: '2026-04-01', priority: 'A', active: true, distanceKm: 10};
const runPlan = ({p = runner, goal = runGoal, history = runHistory(p)} = {}) =>
    generatePlan({profile: p, goal, state: estimateState(history, p, start), startDate: start, generatedAt: timestamp});
const weekRuns = (plan, week) => plan.workouts.filter(w => w.weekId === week.id);

describe('running plans', () => {
    test.each(Object.keys(RUN_GOALS))('%s: valid, deterministic, with quality kept in a taper that follows a training week', type => {
        const goal = {...runGoal, type};
        const plan = runPlan({goal});
        expect(runPlan({goal})).toEqual(plan);
        expect(plan.sport).toBe('running');
        expect(plan.workouts.every(w => w.sport === 'running')).toBe(true);
        expect(() => validatePlan(plan, runner, plan.coachingConfig)).not.toThrow();
        const taper = plan.weeks.findIndex(w => w.phaseType === 'taper');
        expect(plan.weeks[taper - 1].phaseType).not.toBe('recovery');
        for(const week of plan.weeks.filter(w => w.phaseType === 'taper')) {
            expect(weekRuns(plan, week).some(w => FAMILIES[w.family].hard)).toBe(true);
        }
        for(const [index, week] of plan.weeks.entries()) {
            for(const [family, share] of Object.entries({threshold: 0.1, aerobic: 0.08, sprint: 0.05})) {
                const qualitySeconds = sum(weekRuns(plan, week).filter(w => w.family === family)
                    .flatMap(w => w.steps.filter(s => s.power > 0.9)).map(s => s.duration));
                expect(qualitySeconds).toBeLessThanOrEqual(qualityReferenceMinutes(plan.weeks, index) * 60 * share);
            }
        }
    });

    test('validates the aggregate weekly quality cap, including after adaptation', () => {
        const plan = runPlan();
        expect(() => validatePlan(plan, runner, {...plan.coachingConfig, runThresholdWeeklyShare: 0.001}))
            .toThrow(/weekly running quality cap/);
        const completed = plan.workouts.find(w => w.family === 'threshold');
        const activity = normalizeActivity({id: 'threshold-run', sport: 'running',
            start: `${completed.date}T07:00:00Z`, duration: completed.duration,
            distance: completed.duration * 1000 / runner.thresholdPace * completed.targetIntensity, rpe: 7}, runner);
        const next = adaptPlan({plan, profile: runner, state: estimateState(runHistory(), runner, start),
            trigger: 'completed', date: completed.date, timestamp, workoutId: completed.id,
            activity, match: {confidence: 1, quality: 1}});
        expect(() => validatePlan(next, runner, next.coachingConfig)).not.toThrow();
        for(const [index, week] of next.weeks.entries()) {
            const thresholdSeconds = sum(weekRuns(next, week).filter(w => w.family === 'threshold')
                .flatMap(w => w.steps.filter(s => s.power > 0.9)).map(s => s.duration));
            expect(thresholdSeconds).toBeLessThanOrEqual(qualityReferenceMinutes(next.weeks, index) * 6);
        }
    });

    test('rejects a run that exceeds the longest recent run by more than the spike limit', () => {
        const plan = runPlan();
        const longest = plan.workouts.reduce((a, b) => b.duration > a.duration ? b : a);
        longest.steps = longest.steps.map(s => ({...s, duration: s.duration * 2}));
        longest.duration *= 2;
        expect(() => validatePlan(plan, runner, plan.coachingConfig)).toThrow(/spike limit/);
    });

    test('novices get run-walk, no hard sessions, steady frequency and gradually rising minutes', () => {
        const plan = runPlan({p: novice, goal: {...runGoal, type: 'first_5k', distanceKm: 5}, history: []});
        expect(plan.workouts.some(w => FAMILIES[w.family].hard)).toBe(false);
        expect(weekRuns(plan, plan.weeks[0]).every(w => w.runFormat.runWalk)).toBe(true);
        const training = plan.weeks.filter(w => !['recovery', 'taper'].includes(w.phaseType));
        const minutes = training.map(w => sum(weekRuns(plan, w).map(x => x.duration)));
        expect(training.every(w => weekRuns(plan, w).length === novice.availableDays.length)).toBe(true);
        expect(minutes.every((m, i) => !i || m >= minutes[i - 1])).toBe(true);
        expect(minutes.at(-1)).toBeGreaterThan(minutes[0]);
    });

    test('strides are only added to easy runs and match their stride steps', () => {
        const plan = runPlan();
        const withStrides = plan.workouts.filter(w => w.runFormat?.strides);
        expect(withStrides.length).toBeGreaterThan(0);
        expect(withStrides.every(w => !FAMILIES[w.family].hard)).toBe(true);
        expect(withStrides.every(w => w.runFormat.strides === w.steps.filter(s => s.power === STRIDE).length)).toBe(true);
    });

    test('warns when the safe progression cannot prepare for the race distance', () => {
        const slow = {...novice, thresholdPace: 400};
        const marathon = runPlan({p: slow, goal: {...runGoal, type: 'marathon', distanceKm: 42.195}, history: []});
        expect(marathon.validationWarnings.join(' ')).toMatch(/Longest planned run .* below 50% of the expected race time/);
        expect(runPlan().validationWarnings.join(' ')).not.toMatch(/Longest planned run/);
    });

    test('a missed long run is absorbed without breaking the running safety rules', () => {
        const plan = runPlan();
        const longRun = plan.workouts.find(w => w.family === 'durability');
        const next = adaptPlan({plan, profile: runner, state: estimateState(runHistory(), runner, start),
            trigger: 'missed', date: longRun.date, timestamp, workoutId: longRun.id});
        expect(next.workouts.find(w => w.id === longRun.id).status).toBe('missed');
        expect(() => validatePlan(next, runner, next.coachingConfig)).not.toThrow();
    });
});

describe('running metrics, paces and exports', () => {
    test('pace load is rTSS-like and threshold pace follows Riegel from a race', () => {
        const run = normalizeActivity({id: 'tempo', sport: 'running', start: `${start}T07:00:00Z`,
            duration: 3600, distance: 12000, rpe: 7}, runner);
        expect(run.loadMetrics.pace.value).toBeCloseTo(100, 5);
        expect(thresholdPaceFromRace(5, 1500)).toBe(315);
        expect(parsePace('4:30')).toBe(270);
        expect(parsePace('4:75')).toBeNull();
        expect(formatPace(270)).toBe('4:30/km');
    });

    test('pace guide lists each target zone once, fastest first', () => {
        const steps = [{power: 0.75}, {power: 0.98}, {power: 0.7}, {power: 0.98}, {power: 0.75}];
        expect(describeRunPaces(steps, 300)).toBe('threshold 5:06/km, warm-up 6:40/km, jog 7:09/km');
        expect(describeRunPaces(steps, null)).toBe('');
    });

    test('runs export as running ZWO and only match running sessions', () => {
        const plan = runPlan();
        const run = plan.workouts.find(w => w.family === 'threshold');
        expect(exportZwo(run)).toContain('<sportType>run</sportType>');
        expect(exportZwo(run)).toContain('pace="2"');
        const activity = normalizeActivity({id: 'a', sport: 'running', start: `${run.date}T07:00:00Z`,
            duration: run.duration, distance: Math.round(run.duration * 1000 / 300 * run.targetIntensity)}, runner);
        expect(matchWorkout(activity, plan.workouts).workoutId).toBe(run.id);
        const ride = generatePlan({profile, goal: rideGoal, state: rideState(), startDate: start, generatedAt: timestamp});
        expect(matchWorkout({...activity, day: ride.workouts[0].date}, ride.workouts).workoutId).toBeNull();
    });
});
