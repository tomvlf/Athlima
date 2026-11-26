/** Tests Phase 5 today guidance and concise candidate summaries without plan mutation. */

import { todayRecommendation, microcycleChangeSummary, visibleCoachText } from '../../src/coaching/microcycle-summary.js';
import { profile, start, state } from './fixtures.js';

const workout = {id: 'today', date: start, status: 'scheduled', family: 'threshold', title: 'Threshold 45 min',
    duration: 2700, expectedRpe: 7, description: 'Build sustainable power.'};
const data = overrides => ({profile, safetyStatus: null, snapshots: [state()],
    plan: {status: 'active', trainingPaused: false, workouts: [workout]}, ...overrides});

test('returns today’s existing session without creating a separate prescription', () => {
    const input = data();
    const before = JSON.stringify(input);
    const supported = {...state(), sufficiency: 'supported',
        readiness: {status: 'unknown', reason: 'Recent training evidence supports considering the existing planned quality sessions.'}};
    const result = todayRecommendation({data: input, state: supported, now: `${start}T10:00:00Z`});
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
        .toMatchObject({status: 'rest', session: null, title: 'Recovery and rest today'});
});

test('requires setup or a dated snapshot and does not invent missing evidence', () => {
    expect(todayRecommendation({data: null, now: `${start}T10:00:00Z`})).toMatchObject({
        status: 'unavailable', title: 'Coach setup required',
    });
    expect(todayRecommendation({data: data({plan: null}), now: `${start}T10:00:00Z`})).toMatchObject({
        status: 'unavailable', title: 'No active Coach plan',
    });
    expect(todayRecommendation({data: data(), state: null, now: `${start}T10:00:00Z`})).toMatchObject({
        status: 'unknown', snapshotDate: null,
    });
    expect(todayRecommendation({data: data(), state: {...state(), date: '2025-12-31'},
        now: `${start}T10:00:00Z`})).toMatchObject({status: 'unknown', snapshotDate: '2025-12-31'});
});

test('limits advice when the recent evidence sufficiency is limited', () => {
    const limited = {...state(), sufficiency: 'limited', confidence: 'low',
        readiness: {status: 'unknown', reason: 'Recent training evidence is limited.'}};
    expect(todayRecommendation({data: data(), state: limited, now: `${start}T10:00:00Z`}))
        .toMatchObject({status: 'review', snapshotDate: start});
});

test('does not expose percent-encoded whitespace in rest guidance', () => {
    const result = todayRecommendation({
        data: data({plan: {...data().plan, workouts: []}}),
        state: {...state(), date: start},
        now: `${start}T10:00:00Z`,
    });
    expect(result.reason).not.toContain('%20');
    expect(result.reason).toContain('no missed work or catch-up');
    expect(visibleCoachText('Recovery%20and%20rest%20today')).toBe('Recovery and rest today');
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
