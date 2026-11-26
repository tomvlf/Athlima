/**
 * Detects when the Coach should prepare a fresh microcycle review. Triggers are deterministic and
 * read-only: they may create a proposal for the rider to inspect, but never accept or persist it.
 */

import { daysBetween, localDay } from './domain.js';
import { recordMicrocycleEvent } from './microcycle-diagnostics.js';

const REVIEW_TRIGGERS = Object.freeze({
    safety: 'Pain or illness status changed.',
    caution: 'Recent recovery signals reached the Coach caution threshold.',
    load: 'Recent training load or ramp exceeded the configured review threshold.',
    availability: 'Coach availability or session limits changed.',
    evidence: 'New training evidence is available since the last plan decision.',
    weekly: 'A new seven-day review is due.',
});

const availabilityChanged = (data) => {
    const current = data.profile;
    const planned = data.plan.profileSnapshot || data.snapshots?.at(-1)?.profileInputs || null;
    if(!planned) return false;
    return JSON.stringify(current.availableDays) !== JSON.stringify(planned.availableDays) ||
        JSON.stringify(current.maxSessionMinutes) !== JSON.stringify(planned.maxSessionMinutes) ||
        JSON.stringify(current.dayPreferences || {}) !== JSON.stringify(planned.dayPreferences || {});
};

const elevatedLoad = (state, plan) => {
    if(!state || !plan) return false;
    const chronic = Number(state.chronicLoad);
    const ramp = Number(state.rampRate);
    const maxRamp = Number(plan.coachingConfig?.maxRamp);
    return Number.isFinite(chronic) && chronic > 0 &&
        (Number.isFinite(ramp) && Number.isFinite(maxRamp) && ramp / chronic > maxRamp);
};

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
    const availabilityKey = JSON.stringify({
        availableDays: data.profile.availableDays,
        maxSessionMinutes: data.profile.maxSessionMinutes,
        dayPreferences: data.profile.dayPreferences || {},
    });
    const loadKey = JSON.stringify({
        acuteLoad: state?.acuteLoad ?? null,
        chronicLoad: state?.chronicLoad ?? null,
        rampRate: state?.rampRate ?? null,
    });
    const fingerprint = [data.plan.id, data.plan.revision, state?.id ?? 'none', today,
        data.safetyStatus ?? 'safe', state?.readiness?.status ?? 'unknown',
        availabilityKey, loadKey].join(':');
    const status = (data.microcycleReviews || []).find(entry => entry.status === 'dismissed' &&
        entry.fingerprint === fingerprint);
    if(status) return null;
    if(data.safetyStatus || data.plan.trainingPaused) {
        const trigger = {kind: 'safety', reason: REVIEW_TRIGGERS.safety, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
    }
    if(state?.readiness?.status === 'caution') {
        const trigger = {kind: 'caution', reason: REVIEW_TRIGGERS.caution, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
    }
    if(availabilityChanged(data)) {
        const trigger = {kind: 'availability', reason: REVIEW_TRIGGERS.availability, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
    }
    if(elevatedLoad(state, data.plan)) {
        const trigger = {kind: 'load', reason: REVIEW_TRIGGERS.load, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
    }
    if(state && state.id !== data.plan.sourceSnapshot) {
        const trigger = {kind: 'evidence', reason: REVIEW_TRIGGERS.evidence, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
    }
    const lastDate = lastReview?.date ?? latestDecision?.observations?.date ?? data.plan.startDate;
    if(daysBetween(lastDate, today) >= 7) {
        const trigger = {kind: 'weekly', reason: REVIEW_TRIGGERS.weekly, today, fingerprint};
        recordMicrocycleEvent({type: 'trigger_detected', timestamp: now, planRevision: data.plan.revision,
            trigger: trigger.kind});
        return trigger;
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
