/**
 * Retries the hand-off from saved ride recordings to the local Coach. Here "sync" means between two
 * databases in this browser, not an upload to an online account. A recording stays marked pending
 * until the Coach has accepted it.
 */

import { drainRideOutbox } from './ride-outbox.js';

/**
 * Import each pending recording into the Coach, then persist its completed hand-off marker. Return
 * whether processed rides require plan review. Train Now rides enter history but must not trigger
 * overdue-session reconciliation. If saving fails, leave the marker available for a later retry;
 * stable ride IDs prevent duplicate coaching history.
 */
export async function syncRecordedRides(service) {
    const report = await drainRideOutbox(service);
    if(report.failed) {
        const failure = report.results.find(result => result.status === 'failed');
        throw new Error(failure?.error || 'Some rides are still waiting for their Coach hand-off.');
    }
    return {
        synced: report.synced,
        planReviewRequired: report.synced === 0 || report.planReviewRequired,
    };
}
