/**
 * Produces concise, UI-safe data for today's Coach recommendation and a reviewed candidate summary.
 * It reuses Phase 1 readiness evidence and existing plan sessions; it does not prescribe a separate
 * workout, modify a plan or persist data.
 */

import { localDay } from './domain.js';
import { microcycleReadiness } from './microcycle-context.js';

/**
 * Select today's existing planned session and explain whether it remains actionable.
 *
 * @param {object} [input] - Recommendation inputs.
 * @param {object} input.data - Current Coach data.
 * @param {object} [input.state] - Latest athlete-state snapshot.
 * @param {string} [input.now] - ISO timestamp used to resolve the local day.
 * @returns {object|null} Conservative action recommendation or null outside a configured Coach.
 */
export function todayRecommendation({data, state = data?.snapshots?.at(-1), now = new Date().toISOString()} = {}) {
    if(!data?.profile || !data.plan || data.plan.status !== 'active') return null;
    const day = localDay(now, data.profile.timeZone);
    const readiness = microcycleReadiness({...state, safetyStatus: data.safetyStatus});
    const session = data.plan.workouts.find(workout => workout.date === day && workout.status === 'scheduled') ?? null;
    if(readiness.status === 'paused' || data.plan.trainingPaused) {
        return {day, status: 'paused', session: null, title: 'Training paused', reason: readiness.reason};
    }
    if(!session) {
        return {day, status: 'rest', session: null, title: 'No planned session today',
            reason: 'Follow the current plan and use the next scheduled session rather than adding catch-up work.'};
    }
    if(readiness.status === 'caution' && session.role !== 'recovery' && session.family !== 'recovery') {
        return {day, status: 'review', session, title: 'Review today’s session first',
            reason: `${readiness.reason} Review the next seven days before starting this session.`};
    }
    return {day, status: 'planned', session, title: session.title,
        reason: session.description || session.reason || 'This is today’s existing planned session.'};
}

/**
 * Summarise stable review diff counts and net duration.
 *
 * @param {object} review - Microcycle review containing session changes.
 * @returns {object} Counts, net-minute change, headline and detail.
 */
export function microcycleChangeSummary(review) {
    const changes = review?.changes || [];
    const counts = {added: 0, modified: 0, removed: 0};
    let minutesBefore = 0, minutesAfter = 0;
    for(const change of changes) {
        counts[change.action]++;
        minutesBefore += (change.previous?.duration || 0) / 60;
        minutesAfter += (change.current?.duration || 0) / 60;
    }
    const deltaMinutes = Math.round(minutesAfter - minutesBefore);
    const parts = [
        counts.modified ? `${counts.modified} adjusted` : null,
        counts.removed ? `${counts.removed} removed` : null,
        counts.added ? `${counts.added} added` : null,
    ].filter(Boolean);
    return {
        counts,
        deltaMinutes,
        headline: changes.length ? parts.join(', ') : 'No session changes',
        detail: changes.length
            ? `${Math.abs(deltaMinutes)} minute${Math.abs(deltaMinutes) === 1 ? '' : 's'} ${deltaMinutes < 0 ? 'less' : deltaMinutes > 0 ? 'more' : 'net change'}`
            : 'The current seven-day plan already matches the reviewed evidence.',
    };
}
