/**
 * Retries the hand-off from saved ride recordings to the local Coach. Here "sync" means between two
 * databases in this browser, not an upload to an online account. A recording stays marked pending
 * until the Coach has accepted it.
 */

import { idb } from '../storage/idb.js';

/**
 * Import each pending recording into the Coach, then persist its completed hand-off marker. Return
 * the number processed. If saving fails, leave the marker available for a later retry; stable ride
 * IDs prevent duplicate coaching history.
 */
export async function syncRecordedRides(service) {
    const records = await idb.getAll('activity');
    let synced = 0;
    for(const record of records) {
        if(!record.pendingSync || !record.ride) continue;
        await service.recordRide(record.ride, record.coachingWorkoutId);
        await idb.putChecked('activity', {...record, pendingSync: false,
            summary: {...record.summary, pendingSync: false}});
        synced++;
    }
    return synced;
}
