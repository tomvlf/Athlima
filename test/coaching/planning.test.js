/*
 * planning.test.js: test coverage module.
 *
 * Why this exists:
 * This file is part of Athlima and is kept separate so the application can be understood
 * as a set of focused responsibilities instead of one large unstructured script.
 * The code here is intentionally organized around one job so a new contributor can
 * follow the data flow and the reason for each step without reading unrelated code.
 *
 * What it does:
 * documents the expected behavior of the application and prevents regressions during development.
 *
 * Developer note:
 * Read this file as the boundary of the problem it solves: inputs, transformations,
 * persistence, and outputs. If a change affects the behaviour of this module, update
 * the tests and the surrounding callers in the same review.
 */

import { GOALS, addDays, sum, daysBetween } from '../../src/coaching/domain.js';
import { generatePlan, validatePlan } from '../../src/coaching/planner.js';
import { modelGoalDemand, analyzeGaps } from '../../src/coaching/demands.js';
import { progressWorkout, exportZwo, toAppWorkout, FAMILIES, stepLoad } from '../../src/coaching/workouts.js';
import { adaptPlan, matchWorkout } from '../../src/coaching/adaptation.js';
import { normalizeActivity } from '../../src/coaching/normalizer.js';
import { profile, goal, start, timestamp, state, history } from './fixtures.js';

const plan = overrides => generatePlan({profile, goal, state: state(), startDate: start,
    generatedAt: timestamp, ...overrides});

describe('goal-specific deterministic planning', () => {
    test('one very short ride does not shrink the plan below the no-history starting volume', () => {
        const ride = normalizeActivity({id: 'tiny', start: `${addDays(start, -1)}T08:00:00Z`,
            duration: 33, normalizedPower: 90, averagePower: 90}, profile);
        const tiny = plan({state: state(profile, [ride])});
        const empty = plan({state: state(profile, [])});
        expect(tiny.workouts.length).toBeGreaterThan(0);
        expect(tiny.initialLimits.minutes).toBe(empty.initialLimits.minutes);
        expect(() => validatePlan(tiny, profile)).not.toThrow();
    });
    test.each(Object.keys(GOALS))('builds safe dated %s plans for realistic availability', type => {
        const p = plan({goal: {...goal, type}});
        expect(p).toEqual(plan({goal: {...goal, type}}));
        expect(p.workouts.length).toBeGreaterThan(0);
        expect(p.phases.some(p => p.type === 'base')).toBe(true);
        expect(p.phases.some(p => p.type === 'build')).toBe(true);
        expect(p.phases.some(p => p.type === 'recovery')).toBe(true);
        expect(p.phases.at(-1).type).toBe('event');
        expect(p.phases.at(-2).type).toBe('taper');
        expect(() => validatePlan(p, profile)).not.toThrow();
        // Taper research (Bosquet 2007): cut volume, keep intensity; arrive from a training week, not a deload.
        const taper = p.weeks.findIndex(w => w.phaseType === 'taper');
        expect(p.weeks[taper - 1].phaseType).not.toBe('recovery');
        expect(p.workouts.some(w => w.weekId === p.weeks[taper].id && FAMILIES[w.family].hard)).toBe(true);
        for(const workout of p.workouts) {
            expect(workout.duration / 60).toBeLessThanOrEqual(profile.maxSessionMinutes[
                new Date(workout.date).getUTCDay()]);
            expect(workout.description).toMatch(/supports/);
            expect(workout.date < goal.date).toBe(true);
        }
    });
    test('demands differ by goal and known gaps affect priority without fabricating unknowns', () => {
        expect(modelGoalDemand({...goal, type: 'sprint'}).capabilities.sprint)
            .toBeGreaterThan(modelGoalDemand(goal).capabilities.sprint);
        const gaps = analyzeGaps(state(), modelGoalDemand({...goal, targetFTP: 300}), {...goal, targetFTP: 300});
        expect(gaps.gaps.threshold.value).toBeCloseTo(1 - 250 / 300);
        const hourGoal = {...goal, targetPower: 300, expectedDurationMinutes: 60};
        const powerTarget = analyzeGaps(state(), modelGoalDemand(hourGoal), hourGoal);
        expect(powerTarget.gaps.threshold.value).toBeCloseTo(1 - 250 / 300);
        const longGoal = {...goal, targetPower: 300, expectedDurationMinutes: 360};
        expect(analyzeGaps(state(), modelGoalDemand(longGoal), longGoal).gaps.threshold.value).toBeNull();
        expect(gaps.gaps.sprint.value).toBeNull();
    });
    test('goal registry is extensible', () => {
        const p = plan({goal: {...goal, type: 'custom'}, registry: {...GOALS, custom: [1, 2, 3, 4, 5]}});
        expect(p.demand.capabilities.durability).toBeCloseTo(7 / 19);
    });
    test('hard sessions rotate between the goal\'s top demands instead of repeating one stimulus', () => {
        const p = plan({goal: {...goal, type: 'ftp_improvement'}});
        const hard = new Set(p.workouts.filter(w => FAMILIES[w.family].hard).map(w => w.family));
        expect(hard.has('threshold')).toBe(true);
        expect(hard.has('aerobic')).toBe(true);
    });
    test('short lead time does not compress demanding build work', () => {
        const p = plan({goal: {...goal, date: addDays(start, 10)}});
        expect(p.phases.every(p => ['preparation', 'taper', 'event'].includes(p.type))).toBe(true);
        expect(p.workouts.every(w => !FAMILIES[w.family].hard)).toBe(true);
        expect(p.validationWarnings.join(' ')).toMatch(/Short lead/);
    });
    test('duration-only and absent history remain useful but more conservative', () => {
        const p = plan({state: state(profile, [])});
        expect(p.weeks[0].targetMinutes).toBeLessThanOrEqual(90);
        expect(p.workouts.every(w => !FAMILIES[w.family].hard)).toBe(true);
        expect(p.weeks.every(w => w.rampLimit === 0.025)).toBe(true);
        expect(p.phases[0].type).toBe('assessment');
    });
    test('intensity thresholds without a recent measurement date receive a recalibration warning', () => {
        const undated = plan();
        expect(undated.validationWarnings.join(' ')).toMatch(/FTP measurement date is not recorded/);

        const oldDate = addDays(start, -91);
        const stale = plan({profile: {...profile, ftpTestDate: oldDate}});
        expect(stale.validationWarnings.join(' ')).toMatch(/over 90 days old/);
        expect(() => plan({profile: {...profile, ftpTestDate: addDays(start, 1)}}))
            .toThrow(/cannot be after the plan start date/);
    });
    test('planned progression levels reflect successfully completed sessions, not scheduled session counts', () => {
        const athleteState = state();
        athleteState.successfulSessionsByFamily = {threshold: 3};
        const p = plan({goal: {...goal, type: 'ftp_improvement'}, state: athleteState});
        const thresholdSessions = p.workouts.filter(w => w.family === 'threshold');
        expect(thresholdSessions.length).toBeGreaterThan(0);
        expect(thresholdSessions.every(w => w.progressionLevel === 2)).toBe(true);

        const noSuccesses = plan({goal: {...goal, type: 'ftp_improvement'}});
        expect(noSuccesses.workouts.filter(w => w.family === 'threshold')
            .every(w => w.progressionLevel === 1)).toBe(true);
    });
    test('initial power load is bounded by the actual recent and baseline power load', () => {
        const rides = Array.from({length: 14}, (_, i) => normalizeActivity({
            id: `easy-${i}`, start: `${addDays(start, -i * 2)}T09:00:00Z`, duration: 3600,
            normalizedPower: 75, averageHeartRate: 100, rpe: 2,
        }, profile));
        const s = state(profile, rides);
        const p = plan({state: s});
        expect(p.weeks[0].scheduledLoad).toBeLessThanOrEqual(s.weeklyLoad);
        expect(p.weeks[0].scheduledLoad).toBeLessThanOrEqual(14 * 9 / 4);
    });
    test('a novice single-day cycling schedule is capped against recent session duration', () => {
        const athlete = {...profile, availableDays: [6], longRideDay: 6,
            maxSessionMinutes: {6: 240}, typicalWeeklyHours: 8, maxWeeklyHours: 8};
        const p = plan({profile: athlete, state: state(athlete),
            goal: {...goal, date: addDays(start, 91)}});
        expect(p.workouts.length).toBeGreaterThan(0);
        expect(p.workouts[0].duration / 60).toBeLessThanOrEqual(75);
        expect(() => validatePlan(p, athlete)).not.toThrow();
    });
    test('planned recovery returns to a bounded prior envelope rather than shrinking indefinitely', () => {
        const p = plan({goal: {...goal, date: addDays(start, 366)}});
        const beforeTaper = p.weeks.filter(w => w.phaseType !== 'taper').at(-1);
        expect(beforeTaper.scheduledMinutes).toBeGreaterThanOrEqual(p.weeks[0].scheduledMinutes);
    });
    test('a long interruption stages the return to training and keeps the stages after the first ride back', () => {
        const p = plan();
        const returnDate = addDays(start, 35);
        const adapted = adaptPlan({plan: p, profile, state: state(profile, history(), returnDate), trigger: 'missed',
            date: returnDate, timestamp, workoutId: p.workouts[0].id});
        expect(adapted.adaptations.at(-1).observations.returnToTraining).toEqual({days: 35, resumedOn: returnDate});
        const upcoming = (candidate, from, week) => sum(candidate.workouts
            .filter(w => w.weekId === week.id && w.date >= from).map(w => w.duration / 60));
        const returnWeek = adapted.weeks.find(w => w.endDate >= returnDate);
        expect(upcoming(adapted, returnDate, returnWeek)).toBeGreaterThan(0);
        expect(upcoming(adapted, returnDate, returnWeek)).toBeLessThanOrEqual(returnWeek.plannedMinutes * 0.33 + 0.01);
        expect(adapted.workouts.some(w => w.date >= returnDate && w.date < addDays(returnDate, 23) &&
            FAMILIES[w.family].hard)).toBe(false);
        expect(() => validatePlan(adapted, profile)).not.toThrow();

        const first = adapted.workouts.find(w => w.date >= returnDate && w.status === 'scheduled');
        const ride = normalizeActivity({id: 'return-ride', start: `${first.date}T09:00:00Z`, duration: first.duration,
            normalizedPower: 150, averageHeartRate: 125, rpe: 3}, profile);
        const resumed = adaptPlan({plan: adapted, profile, state: state(profile, [...history(), ride], first.date),
            trigger: 'completed', date: first.date, timestamp, workoutId: first.id, activity: ride,
            match: {confidence: 1, quality: 1}});
        expect(resumed.adaptations.at(-1).observations.returnToTraining.resumedOn).toBe(first.date);
        const week = resumed.weeks.find(w => w.endDate >= first.date);
        expect(upcoming(resumed, addDays(first.date, 1), week)).toBeLessThanOrEqual(week.plannedMinutes * 0.33 + 0.01);
        expect(resumed.workouts.some(w => w.date > first.date && w.date < addDays(first.date, 23) &&
            FAMILIES[w.family].hard)).toBe(false);
    });
    test('a plan started without recent history is not treated as an interruption on its first day', () => {
        const p = plan({state: state(profile, [])});
        const adapted = adaptPlan({plan: p, profile, state: state(profile, []), trigger: 'feedback',
            date: start, timestamp});
        expect(adapted.adaptations.at(-1).observations.returnToTraining).toBeNull();
    });
    test('generation warnings survive adaptation and an upgraded history prompts regeneration', () => {
        const thin = state(profile, history().slice(0, 3));
        const p = plan({profile: {...profile, ftpTestDate: null}, state: thin});
        expect(p.dataSufficiency).not.toBe('supported');
        expect(p.validationWarnings.join(' ')).toMatch(/FTP measurement date is not recorded/);
        const adapted = adaptPlan({plan: p, profile: {...profile, ftpTestDate: null}, state: state(),
            trigger: 'feedback', date: start, timestamp});
        expect(adapted.validationWarnings.join(' ')).toMatch(/FTP measurement date is not recorded/);
        expect(adapted.validationWarnings.join(' ')).toMatch(/generate a new plan/);
        expect(adapted.workouts.filter(w => FAMILIES[w.family].hard)).toHaveLength(0);
    });
    test('no session fits: explain rather than silently overbook', () => {
        const p = plan({profile: {...profile, availableDays: [2], maxSessionMinutes: {2: 5}, longRideDay: 2}});
        expect(p.workouts).toHaveLength(0);
        expect(p.validationWarnings.join(' ')).toMatch(/No safe session/);
    });
    test('rejects invalid dates, impossible profiles and unsafe modifications', () => {
        expect(() => plan({goal: {...goal, date: start}})).toThrow();
        expect(() => plan({goal: {...goal, date: '2026-02-30'}})).toThrow();
        expect(() => plan({profile: {...profile, maxWeeklyHours: 1}})).toThrow();
        const p = plan();
        p.workouts[0].duration = 99999;
        expect(() => validatePlan(p, profile)).toThrow(/Unsafe/);
    });
    test('structured steps and exports preserve exact duration and relative FTP targets', () => {
        const w = progressWorkout({id: 'w', date: start, minutes: 45, family: 'threshold',
            level: 4, phaseId: 'p', weekId: 'w', phaseType: 'build', profile});
        expect(sum(w.steps.map(s => s.duration))).toBe(2700);
        expect(toAppWorkout(w).coachingWorkoutId).toBe(w.id);
        expect(exportZwo({...w, title: '<x>'})).toContain('&lt;x&gt;');
        expect(toAppWorkout(w).intervals).toHaveLength(w.steps.length);
        expect(toAppWorkout(w).meta.duration).toBe(w.duration);
        expect(toAppWorkout(w).intervals.every(i => i.duration === i.steps[0].duration)).toBe(true);
    });
    test('interval load forecasts equal normalized-power load from ideal execution, not a lower squared-power proxy', () => {
        const steps = [{duration: 300, power: 0.5}, {duration: 300, power: 1.2}, {duration: 300, power: 0.5}];
        const actual = normalizeActivity({id: 'ideal', start: `${start}T10:00:00Z`, duration: 900,
            streams: {power: steps.flatMap(s => Array(s.duration).fill(s.power * profile.ftp))}}, profile);
        const squaredPowerProxy = sum(steps.map(s => s.duration / 3600 * s.power ** 2 * 100));
        expect(stepLoad(steps)).toBeCloseTo(actual.loadMetrics.power.value, 8);
        expect(stepLoad(steps)).toBeGreaterThan(squaredPowerProxy);
    });
    test('availability/lead-time matrix preserves volume and load ramp bounds', () => {
        for(const days of [[1], [1, 2], [0, 1, 2, 3, 4, 5, 6]]) {
            for(const lead of [1, 8, 20, 28, 60, 180, 366]) {
                const athlete = {...profile, availableDays: days,
                    longRideDay: days.at(-1), maxSessionMinutes: Object.fromEntries(days.map(d => [d, 45]))};
                const p = plan({profile: athlete, state: state(athlete), goal: {...goal, date: addDays(start, lead)}});
                expect(() => validatePlan(p, athlete)).not.toThrow();
                for(let i = 1; i < p.weeks.length; i++) {
                    const recent = p.weeks.slice(Math.max(0, i - 4), i);
                    expect(p.weeks[i].scheduledMinutes).toBeLessThanOrEqual(Math.max(...recent.map(w => w.scheduledMinutes)) * 1.05 + 0.01);
                    expect(p.weeks[i].scheduledLoad).toBeLessThanOrEqual(Math.max(...recent.map(w => w.scheduledLoad)) * 1.05 + 0.06);
                }
            }
        }
    });
});

describe('matching and future-only adaptation', () => {
    test('duration alone does not auto-match; explicit identity is deterministic', () => {
        const p = plan(), w = p.workouts[0];
        const a = normalizeActivity({id: 'a', start: `${w.date}T10:00:00Z`, duration: w.duration}, profile);
        expect(matchWorkout(a, p.workouts).workoutId).toBeNull();
        expect(matchWorkout(a, p.workouts, w.id).workoutId).toBe(w.id);
        expect(matchWorkout({...a, sport: 'running'}, p.workouts, w.id).workoutId).toBeNull();
        expect(matchWorkout({...a, intensityFactor: 1.5}, p.workouts).workoutId).toBeNull();
    });
    test('a recorded power stream can prove hard intervals; skipped intervals cannot', () => {
        const p = plan();
        const w = p.workouts.find(x => FAMILIES[x.family].hard);
        const ride = (id, watts) => normalizeActivity({id, start: `${w.date}T10:00:00Z`, duration: w.duration,
            ftp: profile.ftp, streams: {power: w.steps.flatMap(s => Array(s.duration).fill(watts(s)))}}, profile);
        const followed = ride('followed', s => Math.round(s.power * profile.ftp));
        const skipped = ride('skipped', s => Math.round(Math.min(s.power, 0.65) * profile.ftp));
        expect(matchWorkout(followed, p.workouts, w.id).progressionEligible).toBe(true);
        expect(matchWorkout(skipped, p.workouts, w.id).progressionEligible).toBe(false);
        expect(matchWorkout(skipped, p.workouts, w.id).reason).toMatch(/not proven/);
    });
    test.each(['missed', 'failed', 'recovery'])('%s reduces future training and preserves frozen dates', trigger => {
        const p = plan();
        const workout = p.workouts[0];
        const adapted = adaptPlan({plan: p, profile, state: state(), trigger, date: workout.date,
            timestamp, workoutId: trigger === 'recovery' ? null : workout.id});
        expect(adapted.revision).toBe(2);
        expect(p.revision).toBe(1);
        expect(adapted.adaptations[0].loadChange).toBeLessThan(0);
        const frozen = w => trigger === 'recovery' ? w.date < workout.date : w.date <= workout.date;
        expect(adapted.workouts.filter(frozen).map(w => w.steps))
            .toEqual(p.workouts.filter(frozen).map(w => w.steps));
        if(trigger === 'recovery') {
            expect(adapted.workouts.find(w => w.id === workout.id).duration)
                .toBeLessThan(workout.duration);
        }
        expect(adapted.workouts.every(w => p.workouts.some(old => old.id === w.id && old.date === w.date))).toBe(true);
        expect(() => validatePlan(adapted, profile)).not.toThrow();
    });
    test('a short-term reduction stays inside the adaptation window and is held until it ends', () => {
        const p = plan({goal: {...goal, date: addDays(start, 182)}});
        const first = p.workouts[0];
        const windowEnd = addDays(first.date, 7);
        const reduced = adaptPlan({plan: p, profile, state: state(), trigger: 'recovery',
            date: first.date, timestamp});
        const later = w => w.date > windowEnd;
        const before = p.workouts.filter(later), after = reduced.workouts.filter(later);
        const dose = list => list.map(w => `${w.id}:${w.family}:${w.duration}:${JSON.stringify(w.steps)}`);
        // Sessions beyond the window keep their exact planned dose; reductions must not cascade via the ramp cap.
        expect(dose(after)).toEqual(dose(before));
        expect(after.some(w => w.original)).toBe(false);
        const windowed = reduced.workouts.filter(w => w.original);
        expect(windowed.length).toBeGreaterThan(0);
        expect(windowed.every(w => w.original.until === windowEnd && w.date <= windowEnd)).toBe(true);
        expect(() => validatePlan(reduced, profile)).not.toThrow();
        // Later, less cautious events inside the window must not undo the requested easier sessions.
        const pending = w => w.date > first.date && w.date <= windowEnd && w.status === 'scheduled';
        for(const [trigger, workoutId] of [['feedback', null], ['missed', reduced.workouts.find(w => w.date > first.date).id]]) {
            const when = reduced.workouts.find(w => w.id === workoutId)?.date ?? first.date;
            const next = adaptPlan({plan: reduced, profile, state: state(), trigger, date: when, workoutId, timestamp});
            const held = w => w.date > when && pending(w);
            expect(dose(next.workouts.filter(held))).toEqual(dose(reduced.workouts.filter(held)));
            const beyond = w => w.date > addDays(when, 7);
            expect(dose(next.workouts.filter(beyond))).toEqual(dose(p.workouts.filter(beyond)));
            expect(() => validatePlan(next, profile)).not.toThrow();
        }
        // Plans reduced before windows were recorded are restored to their planned dose.
        const legacy = JSON.parse(JSON.stringify(reduced));
        legacy.workouts.forEach(w => { if(w.original) { delete w.original.until; delete w.original.factor; delete w.original.easy; } });
        const restoredPlan = adaptPlan({plan: legacy, profile, state: state(), trigger: 'feedback',
            date: first.date, timestamp});
        const future = w => w.date > first.date;
        expect(dose(restoredPlan.workouts.filter(future))).toEqual(dose(p.workouts.filter(future)));
        expect(restoredPlan.workouts.some(w => w.adaptationNotes.some(n => n.startsWith('Restored')))).toBe(true);
        expect(restoredPlan.workouts.some(w => w.original)).toBe(false);
        expect(() => validatePlan(restoredPlan, profile)).not.toThrow();
    });
    test('a stricter event inside an active reduction window can tighten it', () => {
        const p = plan({goal: {...goal, date: addDays(start, 182)}});
        const first = p.workouts[0];
        const missed = adaptPlan({plan: p, profile, state: state(), trigger: 'missed',
            date: first.date, workoutId: first.id, timestamp});
        const easier = adaptPlan({plan: missed, profile, state: state(), trigger: 'recovery',
            date: first.date, timestamp});
        const inWindow = easier.workouts.filter(w => w.date > first.date && w.date <= addDays(first.date, 7));
        expect(inWindow.length).toBeGreaterThan(0);
        expect(inWindow.every(w => w.family === 'recovery' && w.original.easy)).toBe(true);
        expect(() => validatePlan(easier, profile)).not.toThrow();
    });
    test('missed or failed sessions shorten nearby sessions without converting them to recovery', () => {
        const p = plan({goal: {...goal, date: addDays(start, 182)}});
        const workout = p.workouts[0];
        for(const trigger of ['missed', 'failed']) {
            const adapted = adaptPlan({plan: p, profile, state: state(), trigger, date: workout.date,
                workoutId: workout.id, timestamp});
            const structure = list => list.filter(w => w.date > workout.date && w.family !== 'recovery')
                .map(w => `${w.id}:${w.family}`);
            expect(structure(adapted.workouts)).toEqual(structure(p.workouts));
        }
    });
    test('long unplanned activity reduces the remaining budget without adding catch-up sessions', () => {
        const p = plan(), workout = p.workouts[0];
        const activity = normalizeActivity({id: 'long', start: `${workout.date}T10:00:00Z`,
            duration: 18000, normalizedPower: 230, rpe: 9}, profile);
        const adapted = adaptPlan({plan: p, profile, state: state(), trigger: 'unplanned',
            date: workout.date, activity, timestamp});
        expect(adapted.adaptations[0].loadChange).toBeLessThan(0);
        expect(adapted.workouts.length).toBeLessThanOrEqual(p.workouts.length);
    });
    const complete = (p, w, progressionEligible = false, s = state()) => adaptPlan({plan: p, profile, state: s,
        trigger: 'completed', date: w.date, timestamp, workoutId: w.id,
        activity: normalizeActivity({id: `done-${w.id}`, start: `${w.date}T10:00:00Z`, duration: w.duration,
            normalizedPower: Math.round(w.targetIntensity * profile.ftp), rpe: 5}, profile),
        match: {workoutId: w.id, confidence: 1, quality: 1, progressionEligible}});
    test('a completed ride stays valid history when earlier rides are marked missed afterwards', () => {
        const long = plan().workouts.find(w => w.date === '2026-01-10');
        let next = complete(plan(), long);
        // Overdue sessions are resolved in date order after a sync, as CoachingService.advance does.
        for(const day of ['2026-01-01', '2026-01-03']) {
            next = adaptPlan({plan: next, profile, state: state(), trigger: 'missed', date: day, timestamp,
                workoutId: next.workouts.find(w => w.date === day).id});
        }
        expect(next.workouts.find(w => w.id === long.id)).toMatchObject({status: 'completed', duration: long.duration});
        expect(() => validatePlan(next, profile)).not.toThrow();
    });
    test('overdue sessions awaiting an outcome use the weekly budget before progression', () => {
        const p = plan();
        p.progressionBaseline = Object.fromEntries(Object.keys(FAMILIES).map(family => [family, 20]));
        const next = complete(p, p.workouts.find(w => w.date === '2026-02-14'), true);
        expect(next.workouts.find(w => w.date === '2026-02-12').status).toBe('scheduled');
        expect(() => validatePlan(next, profile)).not.toThrow();
    });
    test('cycling plans stored without a longest-session reference keep their planned rides', () => {
        const longer = Array.from({length: 42}, (_, i) => normalizeActivity({id: `long-${i}`,
            start: `${addDays(start, -2 * i)}T09:00:00Z`, duration: i % 7 === 0 ? 7200 : 3600,
            normalizedPower: 165, averageHeartRate: 130, rpe: 4}, profile));
        const s = state(profile, longer);
        const p = plan({state: s});
        delete p.initialLimits.longestSessionMinutes;
        delete p.initialLimits.longestSessionDate;
        const first = p.workouts.filter(w => w.weekId === p.weeks[0].id).sort((a, b) => b.duration - a.duration)[0];
        const {cyclingInitialSessionMinutes, cyclingSessionSpikeLimit} = p.coachingConfig;
        // Longer than the cap the generic no-history fallback would impose.
        expect(first.duration / 60).toBeGreaterThan(cyclingInitialSessionMinutes * cyclingSessionSpikeLimit);
        const next = complete(p, first, false, s);
        const later = list => list.filter(w => w.date > first.date).map(w => `${w.id}:${w.duration}`);
        expect(later(next.workouts)).toEqual(later(p.workouts));
    });
    test('rejects future or already resolved workouts and completion without evidence', () => {
        const p = plan();
        expect(() => adaptPlan({plan: p, profile, state: state(), trigger: 'completed',
            date: p.workouts[0].date, workoutId: p.workouts[0].id, timestamp})).toThrow();
        expect(() => adaptPlan({plan: p, profile, state: state(), trigger: 'missed',
            date: start, workoutId: p.workouts.at(-1).id, timestamp})).toThrow();
    });
});
