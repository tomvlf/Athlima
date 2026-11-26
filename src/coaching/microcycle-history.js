/**
 * Builds a compact, read-only history from existing immutable plan revisions. It introduces no new
 * persistence model and never restores or mutates a historical plan.
 */

import { microcycleChangeSummary } from './microcycle-summary.js';
import { microcycleForecast } from './microcycle-forecast.js';
import { addDays } from './domain.js';

/** Clone JSON-compatible history entries before returning them to callers. */
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Identify accepted microcycle revisions and return compact read-only summaries.
 *
 * @param {object} data - Coach data containing immutable plan revisions.
 * @param {number} [limit=10] - Maximum history entries, from 1 through 50.
 * @returns {Array<object>} Newest-first accepted microcycle history entries.
 * @throws {Error} When revision history or the limit is invalid.
 */
export function microcycleRevisionHistory(data, limit = 10) {
    if(!data || !Array.isArray(data.revisions)) throw new Error('Coach revision history is required.');
    if(!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('History limit must be between 1 and 50.');
    const entries = [];
    for(const plan of data.revisions) {
        const adaptation = plan.adaptations?.at(-1);
        if(!adaptation || adaptation.newRevision !== plan.revision) continue;
        const review = adaptation.observations?.microcycleReview ?? null;
        const changes = adaptation.changes || [];
        // Manual Phase 3/4 reviews predate trigger provenance; their accepted revision is still a
        // microcycle decision when its source snapshot and revision continuity are present.
        const acceptedReview = review || (plan.sourceSnapshot && adaptation.previousRevision === plan.revision - 1 &&
            ['feedback', 'recovery'].includes(adaptation.trigger));
        if(!acceptedReview) continue;
        const summary = microcycleChangeSummary({changes: changes.map(change => ({
            action: change.action,
            previous: change.previous ? {duration: change.previous.duration} : null,
            current: change.current ? {duration: change.current.duration} : null,
        }))});
        entries.push({
            planId: plan.id,
            revision: plan.revision,
            previousRevision: adaptation.previousRevision,
            timestamp: adaptation.timestamp,
            trigger: review?.kind ?? adaptation.trigger,
            triggerReason: review?.reason ?? adaptation.reasoning,
            reasoning: adaptation.reasoning,
            snapshotId: adaptation.observations?.snapshotId ?? plan.sourceSnapshot,
            changeCount: changes.length,
            summary,
            loadChange: adaptation.loadChange ?? null,
            warningCount: (adaptation.validationWarnings || []).length,
        });
    }
    return entries.sort((a, b) => b.revision - a.revision || String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, limit).map(clone);
}

const workoutAudit = workout => workout ? {
    workoutId: workout.id,
    date: workout.date,
    family: workout.family,
    duration: workout.duration,
    targetLoad: workout.targetLoad,
    progressionLevel: workout.progressionLevel,
    status: workout.status,
    environment: workout.environment,
} : null;

const projectionFor = (plan, startDate) => {
    const endDate = addDays(startDate, 6);
    return {sessions: (plan?.workouts || []).filter(workout =>
        workout.date >= startDate && workout.date <= endDate)
        .map(workout => ({
            workoutId: workout.id,
            date: workout.date,
            role: workout.role || workout.family,
            duration: workout.duration,
            scheduledLoad: workout.targetLoad ?? workout.scheduledLoad ?? 0,
            status: workout.status,
        }))};
};

/**
 * Build a deterministic, secret-free audit export from immutable plan revisions.
 *
 * @param {object} data - Coaching state containing revisions and snapshots.
 * @returns {Array<object>} Accepted review audit entries in newest-first revision order.
 */
export function microcycleAuditTrail(data) {
    if(!data || !Array.isArray(data.revisions)) throw new Error('Coach revision history is required.');
    const revisions = data.revisions.filter(plan => plan && plan.adaptations?.length);
    const entries = [];
    for(const plan of revisions) {
        const adaptation = plan.adaptations.at(-1);
        if(!adaptation || adaptation.newRevision !== plan.revision) continue;
        const observations = adaptation.observations || {};
        const review = observations.microcycleReview || null;
        const acceptedReview = review || (plan.sourceSnapshot && adaptation.previousRevision === plan.revision - 1 &&
            ['feedback', 'recovery'].includes(adaptation.trigger));
        if(!acceptedReview) continue;
        const startDate = review?.date || observations.date || plan.startDate;
        const previousPlan = data.revisions.find(candidate => candidate.revision === adaptation.previousRevision) || null;
        const before = microcycleForecast(projectionFor(previousPlan, startDate));
        const after = microcycleForecast(projectionFor(plan, startDate));
        const snapshot = (data.snapshots || []).find(candidate => candidate.id ===
            (observations.snapshotId || plan.sourceSnapshot)) || null;
        entries.push({
            planId: plan.id,
            oldRevision: adaptation.previousRevision,
            newRevision: plan.revision,
            reviewDate: startDate,
            acceptedAt: adaptation.timestamp,
            trigger: review?.kind ?? adaptation.trigger,
            triggerReason: review?.reason ?? adaptation.reasoning,
            sourceSnapshot: observations.snapshotId ?? plan.sourceSnapshot ?? null,
            readinessStatus: snapshot?.readiness?.status ?? null,
            availability: {
                unavailableDates: observations.unavailableDates ?? null,
                maxMinutesByDate: observations.maxMinutesByDate ?? null,
                temporaryInput: observations.disruptionNote || observations.disruptionNotesByDate ||
                    observations.environmentByDate ? {
                        generalNote: observations.disruptionNote ?? null,
                        notesByDate: observations.disruptionNotesByDate ?? null,
                        environmentByDate: observations.environmentByDate ?? null,
                    } : null,
            },
            changeSummary: microcycleChangeSummary({changes: adaptation.changes || []}),
            changes: (adaptation.changes || []).map(change => ({
                workoutId: change.workoutId ?? change.id,
                action: change.action,
                reason: change.reason,
                previous: workoutAudit(change.previous),
                current: workoutAudit(change.current),
            })),
            forecast: {before, after},
            loadDelta: adaptation.loadChange ?? roundLoad(before.load, after.load),
            validationWarnings: Array.isArray(adaptation.validationWarnings) ? [...adaptation.validationWarnings] : [],
            plannerVersion: plan.plannerVersion ?? plan.workouts?.[0]?.plannerVersion ?? null,
            schemaVersion: plan.schemaVersion ?? null,
        });
    }
    return entries.sort((a, b) => b.newRevision - a.newRevision ||
        String(b.acceptedAt).localeCompare(String(a.acceptedAt))).map(clone);
}

const roundLoad = (before, after) => Math.round((after - before) * 10) / 10;
