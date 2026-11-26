/** Coordinates side-effect-free review and atomic acceptance of adaptive microcycle candidates. */

import { date, localDay } from './domain.js';
import { buildMicrocycleContext } from './microcycle-context.js';
import { buildMicrocycleCandidate } from './microcycle-candidate.js';
import { markAutomaticReview } from './microcycle-triggers.js';

/** Clone JSON-compatible CoachingService data for isolated review calculations. */
const clone = value => JSON.parse(JSON.stringify(value));
/** Compare JSON-compatible values for stale or tampered candidate detection. */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Prepare a side-effect-free microcycle review for an active Coach plan.
 *
 * @param {object} service - CoachingService instance.
 * @param {string|null} [asOf] - Optional in-plan review date.
 * @param {number} [days] - Optional 1-14 day projection window.
 * @param {object} [disruptions] - Optional temporary availability constraints.
 * @param {object|null} [trigger] - Optional automatic review trigger provenance.
 * @returns {object} Complete review context, candidate and source snapshot.
 * @throws {Error} When no active in-range plan or valid candidate is available.
 */
export function reviewMicrocycle(service, asOf = null, days = undefined, disruptions = {}, trigger = null) {
    if(!service?.data?.plan || service.data.plan.status !== 'active') throw new Error('An active Coach plan is required to review a microcycle.');
    const working = clone(service.data);
    const today = date(asOf || localDay(service.clock(), working.profile.timeZone));
    if(today < working.plan.startDate || today > working.plan.endDate) throw new Error('Microcycle review date must fall inside the active plan.');
    const state = service.snapshot(working, today);
    const context = buildMicrocycleContext({profile: working.profile, goal: working.goal, state,
        plan: working.plan, fromDate: today, ...(days == null ? {} : {days})});
    const timestamp = service.clock();
    const proposal = buildMicrocycleCandidate({context, plan: working.plan, profile: working.profile,
        state, timestamp, disruptions});
    markAutomaticReview(proposal.candidatePlan, trigger, timestamp);
    return {...proposal, state, context, reviewedAt: timestamp, automaticTrigger: trigger};
}

/**
 * Revalidate and atomically accept a previously reviewed microcycle candidate.
 *
 * @param {object} service - CoachingService instance.
 * @param {object} review - Complete, unmodified review returned by reviewMicrocycle().
 * @returns {Promise<object>} Newly accepted active plan.
 * @throws {Error} When the review is stale, tampered or storage rejects the commit.
 */
export async function acceptMicrocycle(service, review) {
    if(!review?.source || !review.state || !review.context || !review.candidatePlan) throw new Error('A complete reviewed microcycle candidate is required.');
    const current = service.data;
    if(!current.plan || current.plan.status !== 'active' || review.source.planId !== current.plan.id ||
       review.source.revision !== current.plan.revision || review.source.stateId !== review.state.id) {
        throw new Error('Microcycle candidate is stale; review the current plan again.');
    }
    if(review.state.athleteId !== current.profile.id || review.context.goalId !== current.goal.id) throw new Error('Microcycle candidate does not belong to the configured athlete and goal.');
    const expected = buildMicrocycleCandidate({context: review.context, plan: current.plan,
        profile: current.profile, state: review.state, timestamp: review.reviewedAt,
        disruptions: review.disruptions});
    markAutomaticReview(expected.candidatePlan, review.automaticTrigger, review.reviewedAt);
    if(!same(expected.candidatePlan, review.candidatePlan) || !same(expected.changes, review.changes) ||
       !same(expected.candidate, review.candidate)) throw new Error('Microcycle candidate changed after review and cannot be accepted.');
    if(review.candidatePlan.revision !== current.plan.revision + 1 || review.candidatePlan.sourceSnapshot !== review.state.id) throw new Error('Microcycle candidate revision or source snapshot is invalid.');
    const next = clone(current);
    if(next.snapshots.some(snapshot => snapshot.id === review.state.id)) throw new Error('Microcycle review snapshot was already accepted.');
    next.snapshots.push(clone(review.state));
    next.plan = clone(review.candidatePlan);
    next.revisions.push(clone(review.candidatePlan));
    await service.commit(next);
    return service.data.plan;
}
