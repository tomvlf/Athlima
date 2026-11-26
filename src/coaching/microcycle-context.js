/**
 * Derives the bounded planning context consumed by future Adaptive Microcycle Engine phases. The
 * context is a deterministic read model over existing profile, goal, estimateState snapshot and
 * plan data. It does not create another athlete state, alter a plan or persist anything.
 */

import { goalRegistry, sportOf, validateGoal, validateProfile } from './domain.js';
import { analyzeGaps, modelGoalDemand } from './demands.js';
import { projectMicrocycle } from './microcycle.js';

/**
 * Convert existing readiness and safety evidence into a conservative planning gate. Unknown
 * readiness remains unknown and never becomes proof that quality training is appropriate.
 */
export function microcycleReadiness(state) {
    if(state.safetyStatus) {
        return {status: 'paused', allowQuality: false, volumeFactor: 0,
            reason: `Training is paused while ${state.safetyStatus} is reported.`};
    }
    if(state.readiness?.status === 'caution') {
        return {status: 'caution', allowQuality: false,
            volumeFactor: state.config?.readinessConservativeFactor ?? 0.7,
            reason: state.readiness.reason};
    }
    return {
        status: state.readiness?.status ?? 'unknown',
        allowQuality: state.sufficiency === 'supported',
        volumeFactor: 1,
        reason: state.sufficiency === 'supported'
            ? 'Recent training evidence supports considering the existing planned quality sessions.'
            : 'Training evidence is limited; quality eligibility is not assumed.',
    };
}

/**
 * Build the Phase 1 context used to evaluate a future seven-day rebuild.
 *
 * @param {object} input - Existing authoritative Coach inputs.
 * @returns {object} Deterministic demand, gap, readiness and calendar context.
 */
export function buildMicrocycleContext({profile, goal, state, plan, fromDate, days}) {
    validateProfile(profile);
    if(!state || state.athleteId !== profile.id) {
        throw new Error('The Coach state snapshot must belong to the configured athlete.');
    }
    if(state.sport !== sportOf(profile)) throw new Error('Coach state sport does not match the athlete profile.');
    if(!plan || !plan.startDate || !plan.endDate) throw new Error('An existing dated Coach plan is required.');
    validateGoal(goal, plan.startDate, goalRegistry(sportOf(profile)), state.config);
    if(fromDate < plan.startDate || fromDate > plan.endDate) {
        throw new Error('Microcycle start must fall inside the existing Coach plan.');
    }

    const projection = projectMicrocycle({plan, state, fromDate, ...(days == null ? {} : {days})});
    const demand = modelGoalDemand(goal, goalRegistry(sportOf(profile)), state.config);
    const gaps = analyzeGaps(state, demand, goal);
    const phase = plan.phases?.find(candidate =>
        candidate.startDate <= fromDate && candidate.endDate >= fromDate) ?? null;
    const weeks = (plan.weeks || []).filter(week =>
        week.endDate >= projection.startDate && week.startDate <= projection.endDate);

    return {
        athleteId: profile.id,
        goalId: goal.id,
        sport: sportOf(profile),
        stateId: state.id,
        planId: plan.id,
        revision: plan.revision,
        window: {startDate: projection.startDate, endDate: projection.endDate, days: projection.days},
        phase: phase ? {id: phase.id, type: phase.type, startDate: phase.startDate, endDate: phase.endDate} : null,
        weeks: weeks.map(week => ({id: week.id, phaseId: week.phaseId, phaseType: week.phaseType,
            startDate: week.startDate, endDate: week.endDate, targetMinutes: week.targetMinutes,
            scheduledMinutes: week.scheduledMinutes, scheduledLoad: week.scheduledLoad})),
        demand,
        gaps,
        readiness: microcycleReadiness(state),
        current: projection,
        confidence: state.confidence,
        warnings: projection.warnings,
    };
}
