/**
 * Builds a compact, read-only history from existing immutable plan revisions. It introduces no new
 * persistence model and never restores or mutates a historical plan.
 */

import { microcycleChangeSummary } from './microcycle-summary.js';

const clone = value => JSON.parse(JSON.stringify(value));

/** Identify revisions created by accepted microcycle reviews and summarise their existing evidence. */
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
