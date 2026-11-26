/** Tests Phase 5 today guidance and concise candidate summaries without plan mutation. */

import { todayRecommendation, microcycleChangeSummary } from '../../src/coaching/microcycle-summary.js';
import { profile, start, state } from './fixtures.js';

const workout = {id: 'today', date: start, status: 'scheduled', family: 'threshold', title: 'Threshold 45 min',
    duration: 2700, expectedRpe: 7, description: 'Build sustainable power.'};
const data = overrides => ({profile, safetyStatus: null, snapshots: [state()],
    plan: {status: 'active', trainingPaused: false, workouts: [workout]}, ...overrides});

test('returns today’s existing session without creating a separate prescription', () => {
    const input = data();
    const before = JSON.stringify(input);
    const result = todayRecommendation({data: input, now: `${start}T10:00:00Z`});
    expect(result).toMatchObject({status: 'planned', session: workout, title: workout.title});
    expect(JSON.stringify(input)).toBe(before);
});

test('pauses or asks for review when safety/readiness evidence requires it', () => {
    expect(todayRecommendation({data: data({safetyStatus: 'illness'}), now: `${start}T10:00:00Z`}))
        .toMatchObject({status: 'paused', session: null});
    const cautious = state();
    cautious.readiness = {...cautious.readiness, status: 'caution', reason: 'Combined warning signals.'};
    expect(todayRecommendation({data: data({snapshots: [cautious]}), now: `${start}T10:00:00Z`}))
        .toMatchObject({status: 'review', session: workout});
});

test('returns a conservative rest message when nothing is planned today', () => {
    expect(todayRecommendation({data: data({plan: {...data().plan, workouts: []}}), now: `${start}T10:00:00Z`}))
        .toMatchObject({status: 'rest', session: null});
});

test('summarises stable diff counts and net minutes', () => {
    const summary = microcycleChangeSummary({changes: [
        {action: 'modified', previous: {duration: 3600}, current: {duration: 2700}},
        {action: 'removed', previous: {duration: 1800}, current: null},
        {action: 'added', previous: null, current: {duration: 1200}},
    ]});
    expect(summary.counts).toEqual({added: 1, modified: 1, removed: 1});
    expect(summary.deltaMinutes).toBe(-25);
    expect(summary.headline).toBe('1 adjusted, 1 removed, 1 added');
    expect(microcycleChangeSummary({changes: []}).headline).toBe('No session changes');
});
