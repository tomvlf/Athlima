/**
 * Checks retrying the local recording-to-Coach hand-off. The folder and "server"/"remote" test
 * wording are historical; the supplied recordRide service represents the local Coach. A pending
 * flag is cleared only after the Coach write succeeds, and either write/acknowledgement failure
 * must remain visible and retryable.
 */

import { syncRecordedRides } from '../../src/storage/ride-sync.js';
import { idb } from '../../src/storage/idb.js';

jest.mock('../../src/storage/idb.js', () => ({idb: {getAll: jest.fn(), putChecked: jest.fn()}}));

beforeEach(() => jest.clearAllMocks());

test('retries persisted pending recordings by stable identity and clears outbox only after a successful server write', async () => {
    const pending = {id: 'ride', pendingSync: true, ride: {id: 'ride', duration: 123}, coachingWorkoutId: 'session'};
    idb.getAll.mockResolvedValue([pending, {id: 'old', pendingSync: false}]);
    const service = {recordRide: jest.fn().mockResolvedValue(null)};
    expect(await syncRecordedRides(service)).toEqual({synced: 1, planReviewRequired: true});
    expect(service.recordRide).toHaveBeenCalledWith(pending.ride, 'session');
    expect(idb.putChecked).toHaveBeenCalledWith('activity', {...pending, pendingSync: false, summary: {pendingSync: false}});
});

test('Train Now hand-off is saved without requesting plan review', async () => {
    const pending = {
        id: 'train-now', pendingSync: true,
        ride: {id: 'train-now', duration: 1800, trainNow: true}, summary: {},
    };
    idb.getAll.mockResolvedValue([pending]);
    const service = {recordRide: jest.fn().mockResolvedValue(null)};
    expect(await syncRecordedRides(service)).toEqual({synced: 1, planReviewRequired: false});
    expect(service.recordRide).toHaveBeenCalledWith(pending.ride, undefined);
});

test('mixed pending hand-offs still request plan review for a normal ride', async () => {
    idb.getAll.mockResolvedValue([
        {id: 'train-now', pendingSync: true, ride: {trainNow: true}, summary: {}},
        {id: 'normal', pendingSync: true, ride: {trainNow: false}, summary: {}},
    ]);
    const service = {recordRide: jest.fn().mockResolvedValue(null)};
    expect(await syncRecordedRides(service)).toEqual({synced: 2, planReviewRequired: true});
});

test('failed remote write leaves local outbox pending and surfaces the error', async () => {
    idb.getAll.mockResolvedValue([{pendingSync: true, ride: {id: 'ride'}}]);
    await expect(syncRecordedRides({recordRide: jest.fn().mockRejectedValue(new Error('Offline'))}))
        .rejects.toThrow('Offline');
    expect(idb.putChecked).not.toHaveBeenCalled();
});

test('failed local acknowledgement surfaces the failure so a later idempotent retry is possible', async () => {
    idb.getAll.mockResolvedValue([{pendingSync: true, ride: {id: 'ride'}}]);
    idb.putChecked.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(syncRecordedRides({recordRide: jest.fn().mockResolvedValue(null)})).rejects.toThrow('Quota exceeded');
});

test('outbox report counts only records that remain pending after partial success', async () => {
    idb.getAll.mockResolvedValue([
        {id: 'one', pendingSync: true, ride: {id: 'one'}},
        {id: 'two', pendingSync: true, ride: {id: 'two'}},
        {id: 'three', pendingSync: false, ride: null},
    ]);
    idb.putChecked.mockResolvedValueOnce();
    const {drainRideOutbox} = await import('../../src/storage/ride-outbox.js');
    const report = await drainRideOutbox({
        recordRide: jest.fn()
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(new Error('Coach unavailable')),
    });
    expect(report.synced).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.pending).toBe(1);
});
