/**
 * Produces concise, UI-safe data for today's Coach recommendation and a reviewed candidate summary.
 * It reuses Phase 1 readiness evidence and existing plan sessions; it does not prescribe a separate
 * workout, modify a plan or persist data.
 */

import { localDay } from './domain.js';
import { microcycleReadiness } from './microcycle-context.js';

const visibleText = value => String(value ?? '').replace(/%20/gi, ' ').replace(/%09/gi, ' ');

/**
 * Select today's existing planned session and explain whether it remains actionable.
 *
 * @param {object} [input] - Recommendation inputs.
 * @param {object} input.data - Current Coach data.
 * @param {object} [input.state] - Latest athlete-state snapshot.
 * @param {string} [input.now] - ISO timestamp used to resolve the local day.
 * @returns {object} Conservative action recommendation, including explicit setup or evidence fallbacks.
 */
export function todayRecommendation({data, state = data?.snapshots?.at(-1), now = new Date().toISOString()} = {}) {
    const visible = value => String(value ?? '').replace(/%20/gi, ' ').replace(/%09/gi, ' ');
    const day = localDay(now, data?.profile?.timeZone || 'UTC');
    if(!data?.profile) {
        return {day, status: 'unavailable', session: null, title: 'Coach setup required',
            reason: 'Configure an athlete profile and active plan before following a today recommendation.',
            snapshotDate: null};
    }
    if(!data.plan || data.plan.status !== 'active') {
        return {day, status: 'unavailable', session: null, title: 'No active Coach plan',
            reason: 'Create or restore an active plan before following a today recommendation.',
            snapshotDate: null};
    }
    if(!state || state.date !== day) {
        return {day, status: 'unknown', session: null, title: 'Today’s evidence is not current',
            reason: state?.date
                ? `The latest evidence snapshot is for ${state.date}, not ${day}. Review the latest evidence before training.`
                : `No dated athlete snapshot is available for ${day}. Review the latest evidence before training.`,
            snapshotDate: state?.date ?? null};
    }
    const readiness = microcycleReadiness({...state, safetyStatus: data.safetyStatus});
    const session = data.plan.workouts.find(workout => workout.date === day && workout.status === 'scheduled') ?? null;
    if(readiness.status === 'paused' || data.plan.trainingPaused) {
        return {day, status: 'paused', session: null, title: 'Training paused',
            reason: readiness.reason, snapshotDate: state.date};
    }
    if(!session) {
        const recentLoad = Number.isFinite(state.weeklyLoad)
            ? `Recent load is ${state.weeklyLoad >= 0 ? 'being monitored' : 'not available'}`
            : 'Recent training evidence is limited';
        return {day, status: 'rest', session: null, title: 'Recovery and rest today',
            reason: visibleText(`${recentLoad}. This rest is chosen from your recent training, current recovery signals and active goal; no missed work or catch-up is added.`),
            snapshotDate: state.date};
    }
    if(state.sufficiency !== 'supported' || readiness.status === 'monitor') {
        return {day, status: 'review', session, title: 'Review today’s session first',
            reason: `${readiness.reason} Evidence is limited; this is monitoring guidance, not training clearance.`,
            snapshotDate: state.date};
    }
    if(readiness.status === 'caution' && session.role !== 'recovery' && session.family !== 'recovery') {
        return {day, status: 'review', session, title: 'Review today’s session first',
            reason: `${readiness.reason} Review the next seven days before starting this session.`,
            snapshotDate: state.date};
    }
    return {day, status: 'planned', session, title: session.title,
        reason: session.description || session.reason || 'This is today’s existing planned session.',
        snapshotDate: state.date};
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
