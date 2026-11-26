/**
 * Verifies Phase 2 candidate generation through the existing adaptation and validation engine.
 * Candidates remain uncommitted, preserve frozen work and expose a deterministic review diff.
 */

import { generatePlan } from '../../src/coaching/planner.js';
import { buildMicrocycleContext } from '../../src/coaching/microcycle-context.js';
import { buildMicrocycleCandidate, diffMicrocycles } from '../../src/coaching/microcycle-candidate.js';
import { profile, goal, start, timestamp, state } from './fixtures.js';

function inputs(snapshot = state()) {
    const plan = generatePlan({profile, goal, state: snapshot, startDate: start, generatedAt: timestamp});
    const context = buildMicrocycleContext({profile, goal, state: snapshot, plan, fromDate: start});
    return {context, plan, profile, state: snapshot, timestamp};
}

describe('Adaptive Microcycle Engine Phase 2 candidate', () => {
    test('builds a deterministic uncommitted candidate without mutating authoritative inputs', () => {
        const source = inputs();
        const before = JSON.stringify(source);
        const first = buildMicrocycleCandidate(source);
        const second = buildMicrocycleCandidate(source);

        expect(first).toEqual(second);
        expect(first.trigger).toBe('feedback');
        expect(first.candidatePlan.revision).toBe(source.plan.revision + 1);
        expect(first.candidate.planId).toBe(source.plan.id);
        expect(JSON.stringify(source)).toBe(before);
    });

    test('uses the existing recovery adaptation for caution and exposes reviewable changes', () => {
        const snapshot = state();
        snapshot.readiness = {...snapshot.readiness, status: 'caution', reason: 'Combined warning signals.'};
        const source = inputs(snapshot);
        const result = buildMicrocycleCandidate(source);

        expect(result.trigger).toBe('recovery');
        expect(result.changes.length).toBeGreaterThan(0);
        expect(result.changes.every(change => ['modified', 'removed'].includes(change.action))).toBe(true);
        expect(result.candidate.sessions.every(session => session.role !== 'quality')).toBe(true);
    });

    test('preserves resolved and pre-window workouts', () => {
        const source = inputs();
        const first = source.plan.workouts[0];
        first.status = 'completed';
        const context = buildMicrocycleContext({profile, goal, state: source.state,
            plan: source.plan, fromDate: source.plan.workouts[1].date});
        const result = buildMicrocycleCandidate({...source, context});
        expect(result.candidatePlan.workouts.find(workout => workout.id === first.id)).toEqual(first);
    });

    test('rejects stale contexts and reports stable add/remove/modify differences', () => {
        const source = inputs();
        expect(() => buildMicrocycleCandidate({...source,
            context: {...source.context, revision: source.context.revision + 1}})).toThrow(/no longer matches/);
        const diff = diffMicrocycles({sessions: [{workoutId: 'a', duration: 60},
            {workoutId: 'b', duration: 60}]}, {sessions: [{workoutId: 'a', duration: 30},
            {workoutId: 'c', duration: 60}]});
        expect(diff.map(change => `${change.workoutId}:${change.action}`))
            .toEqual(['a:modified', 'b:removed', 'c:added']);
    });
});
