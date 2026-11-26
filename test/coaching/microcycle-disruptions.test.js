/** Tests Phase 6 temporary availability without catch-up or source mutation. */
import { generatePlan } from '../../src/coaching/planner.js';
import { buildMicrocycleContext } from '../../src/coaching/microcycle-context.js';
import { buildMicrocycleCandidate } from '../../src/coaching/microcycle-candidate.js';
import { normalizeDisruptions, normalizeDisruptionRows, applyMicrocycleDisruptions } from '../../src/coaching/microcycle-disruptions.js';
import { profile, goal, start, timestamp, state } from './fixtures.js';

function source() {
    const snapshot = state();
    const plan = generatePlan({profile, goal, state: snapshot, startDate: start, generatedAt: timestamp});
    const context = buildMicrocycleContext({profile, goal, state: snapshot, plan, fromDate: start});
    return {context, plan, profile, state: snapshot, timestamp};
}

test('removes unavailable sessions without moving or making up their load', () => {
    const input = source(), session = input.context.current.sessions[0], before = JSON.stringify(input);
    const result = buildMicrocycleCandidate({...input, disruptions: {unavailableDates: [session.date], note: 'Travel'}});
    expect(result.candidate.sessions.some(item => item.workoutId === session.workoutId)).toBe(false);
    expect(result.changes).toContainEqual(expect.objectContaining({workoutId: session.workoutId, action: 'removed'}));
    expect(result.disruptions.note).toBe('Travel');
    expect(JSON.stringify(input)).toBe(before);
});

test('shortens a session while preserving its identity and family', () => {
    const input = source(), session = input.context.current.sessions.find(item => item.duration >= 45 * 60);
    const result = buildMicrocycleCandidate({...input,
        disruptions: {maxMinutesByDate: {[session.date]: 30}}});
    const changed = result.candidate.sessions.find(item => item.workoutId === session.workoutId);
    expect(changed.duration).toBe(30 * 60);
    expect(changed.family).toBe(session.family);
});

test('validates bounded dates and whole-minute limits', () => {
    const window = {startDate: '2026-01-01', endDate: '2026-01-07'};
    expect(() => normalizeDisruptions({unavailableDates: ['2026-01-08']}, window)).toThrow(/inside/);
    expect(() => normalizeDisruptions({maxMinutesByDate: {'2026-01-02': 2.5}}, window)).toThrow(/whole minutes/);
});

test('normalizes multiple availability rows with per-date environments and notes', () => {
    const window = {startDate: '2026-01-01', endDate: '2026-01-07'};
    const result = normalizeDisruptionRows([
        {date: '2026-01-03', unavailable: true, maxMinutes: '', environment: 'either', note: 'Travel'},
        {date: '2026-01-04', unavailable: false, maxMinutes: '45', environment: 'indoor', note: ''},
        {date: '2026-01-06', unavailable: false, maxMinutes: '30', environment: 'outdoor', note: 'Late meeting'},
    ], window);
    expect(result.unavailableDates).toEqual(['2026-01-03']);
    expect(result.maxMinutesByDate).toEqual({'2026-01-04': 45, '2026-01-06': 30});
    expect(result.environmentByDate).toEqual({'2026-01-04': 'indoor', '2026-01-06': 'outdoor'});
    expect(result.notesByDate).toEqual({'2026-01-03': 'Travel', '2026-01-06': 'Late meeting'});
});

test('rejects duplicate rows, invalid environments and invalid dates', () => {
    const window = {startDate: '2026-01-01', endDate: '2026-01-07'};
    expect(() => normalizeDisruptionRows([
        {date: '2026-01-03', unavailable: false, maxMinutes: '', environment: 'indoor', note: ''},
        {date: '2026-01-03', unavailable: true, maxMinutes: '', environment: 'outdoor', note: ''},
    ], window)).toThrow(/only once/);
    expect(() => normalizeDisruptions({environmentByDate: {'2026-01-03': 'garage'}}, window))
        .toThrow(/environment/);
    expect(() => normalizeDisruptions({notesByDate: {'2026-01-08': 'Travel'}}, window))
        .toThrow(/inside/);
});

test('removes a session incompatible with a temporary environment instead of moving load', () => {
    const input = source();
    const workout = {id: 'indoor-only', date: start, status: 'scheduled', duration: 3600,
        targetLoad: 30, progressionLevel: 1, family: 'endurance', suitability: ['indoor'],
        weekId: 'week'};
    const plan = {workouts: [workout], weeks: [{id: 'week', targetMinutes: 60, scheduledMinutes: 60,
        scheduledLoad: 30}], adaptations: [{changes: [], reasoning: '', observations: {}}]};
    const result = applyMicrocycleDisruptions({plan, profile: input.profile, state: input.state,
        window: {startDate: start, endDate: '2026-01-07'},
        disruptions: {environmentByDate: {[start]: 'outdoor'}}});
    expect(result.plan.workouts).toHaveLength(0);
    expect(result.changes).toContainEqual(expect.objectContaining({id: 'indoor-only', action: 'removed'}));
});
