/**
 * Detects when the Coach should prepare a fresh microcycle review. Triggers are deterministic and
 * read-only: they may create a proposal for the rider to inspect, but never accept or persist it.
 */

import { daysBetween, localDay } from './domain.js';

const REVIEW_TRIGGERS = Object.freeze({
    safety: 'Pain or illness status changed.',
    caution: 'Recent recovery signals reached the Coach caution threshold.',
    evidence: 'New training evidence is available since the last plan decision.',
    weekly: 'A new seven-day review is due.',
});

/**
 * Return a stable trigger or null when no automatic review is needed.
 *
 * @param {object} [input] - Trigger inputs.
 * @param {object} input.data - Current Coach data.
 * @param {string} [input.now] - ISO timestamp used for trigger evaluation.
 * @returns {object|null} Trigger with kind, reason, date and stable fingerprint.
 */
export function microcycleReviewTrigger({data, now = new Date().toISOString()} = {}) {
    if(!data?.plan || data.plan.status !== 'active' || !data.profile) return null;
    const today = localDay(now, data.profile.timeZone);
    if(today < data.plan.startDate || today > data.plan.endDate) return null;
    const state = data.snapshots?.at(-1) ?? null;
    const latestDecision = data.plan.adaptations?.at(-1) ?? null;
    const lastReview = latestDecision?.observations?.microcycleReview ?? null;
    const fingerprint = [data.plan.id, data.plan.revision, state?.id ?? 'none', today,
        data.safetyStatus ?? 'safe', state?.readiness?.status ?? 'unknown'].join(':');
    const status = (data.microcycleReviews || []).find(entry => entry.status === 'dismissed' &&
        entry.fingerprint === fingerprint);
    if(status) return null;

    if(data.safetyStatus || data.plan.trainingPaused) {
        return {kind: 'safety', reason: REVIEW_TRIGGERS.safety, today, fingerprint};
    }
    if(state?.readiness?.status === 'caution') {
        return {kind: 'caution', reason: REVIEW_TRIGGERS.caution, today, fingerprint};
    }
    if(state && state.id !== data.plan.sourceSnapshot) {
        return {kind: 'evidence', reason: REVIEW_TRIGGERS.evidence, today, fingerprint};
    }
    const lastDate = lastReview?.date ?? latestDecision?.observations?.date ?? data.plan.startDate;
    if(daysBetween(lastDate, today) >= 7) {
        return {kind: 'weekly', reason: REVIEW_TRIGGERS.weekly, today, fingerprint};
    }
    return null;
}

/**
 * Add review provenance to an accepted adaptation.
 *
 * @param {object} candidatePlan - Candidate plan containing the adaptation to annotate.
 * @param {object|null} trigger - Automatic review trigger details.
 * @param {string} reviewedAt - ISO timestamp for the review.
 * @returns {object} The same candidate plan with provenance attached.
 */
export function markAutomaticReview(candidatePlan, trigger, reviewedAt) {
    if(!trigger) return candidatePlan;
    const adaptation = candidatePlan.adaptations?.at(-1);
    if(adaptation) adaptation.observations.microcycleReview = {
        kind: trigger.kind, reason: trigger.reason, date: trigger.today, reviewedAt,
    };
    return candidatePlan;
}
