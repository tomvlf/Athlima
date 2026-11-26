/** Builds an uncommitted microcycle candidate through existing Coach rules and bounded disruptions. */

import { adaptPlan } from './adaptation.js';
import { projectMicrocycle } from './microcycle.js';
import { applyMicrocycleDisruptions, normalizeDisruptions } from './microcycle-disruptions.js';

/** Deep-clone JSON-compatible Coach values without mutating their sources. */
const clone = value => JSON.parse(JSON.stringify(value));
/** Compare JSON-compatible values in canonical object insertion order. */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Compare current and candidate sessions by workout identity.
 *
 * @param {object} current - Existing microcycle projection.
 * @param {object} candidate - Candidate microcycle projection.
 * @returns {Array<object>} Stable added, removed and modified session changes.
 */
export function diffMicrocycles(current, candidate) {
    const before = new Map(current.sessions.map(session => [session.workoutId, session]));
    const after = new Map(candidate.sessions.map(session => [session.workoutId, session]));
    return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(workoutId => {
        const previous = before.get(workoutId) ?? null, next = after.get(workoutId) ?? null;
        if(same(previous, next)) return [];
        return [{workoutId, action: !previous ? 'added' : !next ? 'removed' : 'modified', previous, current: next}];
    });
}

/**
 * Build an uncommitted candidate through existing adaptation and disruption rules.
 *
 * @param {object} input - Candidate inputs.
 * @param {object} input.context - Validated current microcycle context.
 * @param {object} input.plan - Current active plan.
 * @param {object} input.profile - Configured athlete profile.
 * @param {object} input.state - Current dated athlete-state snapshot.
 * @param {string} input.timestamp - ISO timestamp for the candidate revision.
 * @param {object} [input.disruptions] - Optional bounded availability constraints.
 * @returns {object} Candidate plan, projection, diff and review provenance.
 * @throws {Error} When inputs are stale or the candidate changes frozen work.
 */
export function buildMicrocycleCandidate({context, plan, profile, state, timestamp, disruptions = {}}) {
    if(!context || context.planId !== plan?.id || context.revision !== plan?.revision ||
       context.stateId !== state?.id || context.athleteId !== profile?.id) {
        throw new Error('Microcycle context no longer matches the current Coach inputs.');
    }
    if(!Number.isFinite(Date.parse(timestamp))) throw new Error('Candidate timestamp must be valid.');
    const beforePlan = clone(plan), beforeState = clone(state);
    const trigger = ['paused', 'caution'].includes(context.readiness.status) ? 'recovery' : 'feedback';
    let candidatePlan = adaptPlan({plan, profile, state, trigger, date: context.window.startDate, timestamp});
    const normalized = normalizeDisruptions(disruptions, context.window);
    const disrupted = applyMicrocycleDisruptions({plan: candidatePlan, profile, state,
        window: context.window, disruptions: normalized});
    candidatePlan = disrupted.plan;
    const candidate = projectMicrocycle({plan: candidatePlan, state,
        fromDate: context.window.startDate, days: context.window.days});
    const changes = diffMicrocycles(context.current, candidate);
    const frozenIds = new Set(plan.workouts.filter(workout => workout.status !== 'scheduled' ||
        workout.date < context.window.startDate).map(workout => workout.id));
    for(const id of frozenIds) {
        if(!same(plan.workouts.find(workout => workout.id === id),
            candidatePlan.workouts.find(workout => workout.id === id))) {
            throw new Error('Candidate changed a frozen or resolved workout.');
        }
    }
    if(!same(plan, beforePlan) || !same(state, beforeState)) throw new Error('Candidate generation mutated authoritative Coach inputs.');
    return {trigger, source: {planId: plan.id, revision: plan.revision, stateId: state.id},
        window: {...context.window}, current: context.current, candidate, changes, candidatePlan,
        disruptions: normalized,
        reasoning: candidatePlan.adaptations.at(-1)?.reasoning ?? context.readiness.reason,
        validationWarnings: candidatePlan.validationWarnings || []};
}
