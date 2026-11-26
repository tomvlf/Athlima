/**
 * Builds an uncommitted candidate microcycle through the existing adaptation engine. The candidate
 * is a reviewable read model plus a plan revision that CoachingService may commit in a later phase;
 * this module performs no persistence and never mutates its inputs.
 */

import { adaptPlan } from './adaptation.js';
import { projectMicrocycle } from './microcycle.js';

const clone = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Compare the existing and candidate projections by stable workout identity.
 */
export function diffMicrocycles(current, candidate) {
    const before = new Map(current.sessions.map(session => [session.workoutId, session]));
    const after = new Map(candidate.sessions.map(session => [session.workoutId, session]));
    return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(workoutId => {
        const previous = before.get(workoutId) ?? null;
        const next = after.get(workoutId) ?? null;
        if(same(previous, next)) return [];
        return [{workoutId, action: !previous ? 'added' : !next ? 'removed' : 'modified',
            previous, current: next}];
    });
}

/**
 * Build a deterministic candidate from the Phase 1 context and existing Coach inputs. Caution and
 * safety states use the established recovery adaptation; otherwise a feedback review rechecks the
 * future plan against current evidence and budgets.
 */
export function buildMicrocycleCandidate({context, plan, profile, state, timestamp}) {
    if(!context || context.planId !== plan?.id || context.revision !== plan?.revision ||
       context.stateId !== state?.id || context.athleteId !== profile?.id) {
        throw new Error('Microcycle context no longer matches the current Coach inputs.');
    }
    if(!Number.isFinite(Date.parse(timestamp))) throw new Error('Candidate timestamp must be valid.');
    const beforePlan = clone(plan);
    const beforeState = clone(state);
    const trigger = ['paused', 'caution'].includes(context.readiness.status) ? 'recovery' : 'feedback';
    const candidatePlan = adaptPlan({plan, profile, state, trigger,
        date: context.window.startDate, timestamp});
    const candidate = projectMicrocycle({plan: candidatePlan, state,
        fromDate: context.window.startDate, days: context.window.days});
    const changes = diffMicrocycles(context.current, candidate);

    const frozenIds = new Set(plan.workouts.filter(workout => workout.status !== 'scheduled' ||
        workout.date < context.window.startDate).map(workout => workout.id));
    for(const id of frozenIds) {
        const previous = plan.workouts.find(workout => workout.id === id);
        const current = candidatePlan.workouts.find(workout => workout.id === id);
        if(!same(previous, current)) throw new Error('Candidate changed a frozen or resolved workout.');
    }
    if(!same(plan, beforePlan) || !same(state, beforeState)) {
        throw new Error('Candidate generation mutated authoritative Coach inputs.');
    }

    return {
        trigger,
        source: {planId: plan.id, revision: plan.revision, stateId: state.id},
        window: {...context.window},
        current: context.current,
        candidate,
        changes,
        candidatePlan,
        reasoning: candidatePlan.adaptations.at(-1)?.reasoning ?? context.readiness.reason,
        validationWarnings: candidatePlan.validationWarnings || [],
    };
}
