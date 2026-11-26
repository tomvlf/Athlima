/**
 * Exercises the Phase 1 planning context against the existing Coach models. Fixed fixtures keep
 * demand, readiness and calendar derivation repeatable and verify that no source object is mutated.
 */

import { generatePlan } from '../../src/coaching/planner.js';
import { buildMicrocycleContext, microcycleReadiness } from '../../src/coaching/microcycle-context.js';
import { profile, goal, start, timestamp, state } from './fixtures.js';

const inputs = () => {
    const snapshot = state();
    const plan = generatePlan({profile, goal, state: snapshot, startDate: start, generatedAt: timestamp});
    return {profile, goal, state: snapshot, plan, fromDate: start};
};

describe('Adaptive Microcycle Engine Phase 1 context', () => {
    test('derives deterministic demand, readiness and calendar context without mutation', () => {
        const source = inputs();
        const before = JSON.stringify(source);
        const first = buildMicrocycleContext(source);
        const second = buildMicrocycleContext(source);

        expect(first).toEqual(second);
        expect(first.athleteId).toBe(profile.id);
        expect(first.goalId).toBe(goal.id);
        expect(first.stateId).toBe(source.state.id);
        expect(first.planId).toBe(source.plan.id);
        expect(first.current.sessions.length).toBeGreaterThan(0);
        expect(first.demand.capabilities).toEqual(source.plan.demand.capabilities);
        expect(first.gaps.priorities.length).toBeGreaterThan(0);
        expect(first.window).toEqual({startDate: start, endDate: '2026-01-07', days: 7});
        expect(JSON.stringify(source)).toBe(before);
    });

    test('blocks quality for caution or safety status without inventing readiness', () => {
        const snapshot = state();
        snapshot.readiness = {...snapshot.readiness, status: 'caution', reason: 'Combined warning signals.'};
        expect(microcycleReadiness(snapshot)).toMatchObject({status: 'caution', allowQuality: false});

        snapshot.safetyStatus = 'illness';
        expect(microcycleReadiness(snapshot)).toEqual({status: 'paused', allowQuality: false,
            volumeFactor: 0, reason: 'Training is paused while illness is reported.'});

        const unknown = {...state(), sufficiency: 'limited', readiness: {status: 'unknown'}};
        expect(microcycleReadiness(unknown)).toMatchObject({status: 'unknown', allowQuality: false});
    });

    test('rejects mismatched athlete, sport and out-of-plan windows', () => {
        const source = inputs();
        expect(() => buildMicrocycleContext({...source,
            state: {...source.state, athleteId: 'other'}})).toThrow(/athlete/);
        expect(() => buildMicrocycleContext({...source,
            state: {...source.state, sport: 'running'}})).toThrow(/sport/);
        expect(() => buildMicrocycleContext({...source, fromDate: '2025-12-31'})).toThrow(/inside/);
    });
});
