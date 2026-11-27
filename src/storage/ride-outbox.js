/**
 * Controls the in-browser ride-to-Coaching outbox. Coach and provider sync share the same stable
 * ride identity; acknowledgement is written only after the Coach accepted the ride.
 */
import { idb } from './idb.js';

export async function getRideOutboxStatus() {
    const records = await idb.getAllChecked('activity');
    const pending = records.filter(record => record.pendingSync === true && record.ride);
    return {
        pending: pending.length,
        rideIds: pending.map(record => String(record.id)),
    };
}

/** Drain all pending records, continue through ordinary failures, and return a per-ride report. */
export async function drainRideOutbox(service) {
    const records = await idb.getAllChecked('activity');
    const results = [];
    const successfulIds = new Set();
    let planReviewRequired = false;

    for(const record of records) {
        if(record.pendingSync !== true || !record.ride) continue;
        try {
            await service.recordRide(record.ride, record.coachingWorkoutId);
            await idb.putChecked('activity', {
                ...record,
                pendingSync: false,
                summary: {...record.summary, pendingSync: false},
            });
            results.push({id: String(record.id), status: 'synced'});
            successfulIds.add(String(record.id));
            if(record.ride.trainNow !== true) planReviewRequired = true;
        } catch(error) {
            results.push({
                id: String(record.id),
                status: 'failed',
                error: error?.message || 'Local coaching hand-off failed.',
            });
        }
    }

    return {
        synced: results.filter(result => result.status === 'synced').length,
        failed: results.filter(result => result.status === 'failed').length,
        pending: records.filter(record => record.pendingSync === true && record.ride &&
            !successfulIds.has(String(record.id))).length,
        planReviewRequired,
        results,
    };
}
