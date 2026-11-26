/**
 * Verifies that the microcycle boundary projects existing Coach data deterministically without
 * creating a parallel plan model or mutating generated plans and state snapshots.
 */

import { addDays } from '../../src/coaching/domain.js';
import { generatePlan } from '../../src/coaching/planner.js';
import { MICROCYCLE_DAYS, microcycleRole, projectMicrocycle } from '../../src/coaching/microcycle.js';
import { profile, goal, start, timestamp, state } from './fixtures.js';

const generated = () => generatePlan({profile, goal, state: state(), startDate: start,
    generatedAt: timestamp});

describe('Adaptive Microcycle Engine boundary', () => {
    test('projects seven days from the existing plan and state snapshot deterministically', () => {
        const plan = generated();
        const snapshot = state();
        const beforePlan = JSON.stringify(plan);
        const beforeState = JSON.stringify(snapshot);
        const first = projectMicrocycle({plan, state: snapshot, fromDate: start});
        const second = projectMicrocycle({plan, state: snapshot, fromDate: start});

        expect(first).toEqual(second);
        expect(first.days).toBe(MICROCYCLE_DAYS);
        expect(first.startDate).toBe(start);
        expect(first.endDate).toBe(addDays(start, 6));
        expect(first.planId).toBe(plan.id);
        expect(first.stateId).toBe(snapshot.id);
        expect(first.sessions.every(session => session.date >= start &&
            session.date <= addDays(start, 6))).toBe(true);
        expect(JSON.stringify(plan)).toBe(beforePlan);
        expect(JSON.stringify(snapshot)).toBe(beforeState);
    });

    test('keeps existing workout identity and domain vocabulary', () => {
        const plan = generated();
        const snapshot = state();
        const projected = projectMicrocycle({plan, state: snapshot, fromDate: start});

        for(const session of projected.sessions) {
            const workout = plan.workouts.find(candidate => candidate.id === session.workoutId);
            expect(workout).toBeDefined();
            expect(session.family).toBe(workout.family);
            expect(session.role).toBe(microcycleRole(workout));
            expect(session.status).toBe(workout.status);
        }
    });

    test('validates its boundary without persisting placeholder domain objects', () => {
        const plan = generated();
        const snapshot = state();
        expect(() => projectMicrocycle({plan: null, state: snapshot, fromDate: start})).toThrow(/plan/);
        expect(() => projectMicrocycle({plan, state: null, fromDate: start})).toThrow(/state/);
        expect(() => projectMicrocycle({plan, state: snapshot, fromDate: start, days: 0})).toThrow(/1-14/);
        expect(() => projectMicrocycle({plan, state: snapshot, fromDate: '2026-02-30'})).toThrow(/date/);
    });
});
