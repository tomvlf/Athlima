/** Tests Phase 6 temporary availability without catch-up or source mutation. */
import { generatePlan } from '../../src/coaching/planner.js';
import { buildMicrocycleContext } from '../../src/coaching/microcycle-context.js';
import { buildMicrocycleCandidate } from '../../src/coaching/microcycle-candidate.js';
import { normalizeDisruptions } from '../../src/coaching/microcycle-disruptions.js';
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
