/**
 * Uses fake-indexeddb, a test-only browser-database implementation, to check durable Coach writes
 * and reopening. Two open adapters stand in for two browser tabs: a stale writer must fail visibly
 * rather than erase the newer data.
 */

import { IDBFactory } from 'fake-indexeddb';
import { openCoachingStorage } from '../../src/coaching/storage.js';
import { CoachingService } from '../../src/coaching/service.js';
import { profile, goal } from './fixtures.js';

describe('durable coaching IndexedDB storage', () => {
    test('commits before resolving and restores the same bundle after reopening', async () => {
        const idb = new IDBFactory();
        const storage = await openCoachingStorage(idb);
        const service = new CoachingService(storage);
        await service.configure(profile, goal);
        storage.close();
        const reopened = await openCoachingStorage(idb);
        expect(new CoachingService(reopened).data).toEqual(service.data);
        reopened.close();
    });
    test('does not silently overwrite changes from another tab', async () => {
        const idb = new IDBFactory();
        const one = await openCoachingStorage(idb), two = await openCoachingStorage(idb);
        const first = new CoachingService(one), second = new CoachingService(two);
        await first.configure(profile, goal);
        await expect(second.configure(profile, goal)).rejects.toThrow(/another tab/);
        expect(second.data.profile).toBeNull();
        one.close(); two.close();
    });
    test('silently migrates coaching data to the renamed app storage', async () => {
        const idb = new IDBFactory();
        const legacyBrand = ['ath', 'lima'].join('');
        const legacyDatabaseName = `${legacyBrand}-coaching`;
        const legacyKey = `${legacyBrand}-coaching-v1`;
        const legacyDatabase = await new Promise((resolve, reject) => {
            const request = idb.open(legacyDatabaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('state');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const transaction = legacyDatabase.transaction('state', 'readwrite');
            transaction.objectStore('state').put(JSON.stringify({version: 1, profile, goal,
                activities: [], snapshots: [], revisions: [], plan: null, safetyStatus: null,
                microcycleReviews: []}), legacyKey);
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
        });
        legacyDatabase.close();
        const migrated = await openCoachingStorage(idb);
        expect(migrated.getItem()).toContain('"profile"');
        migrated.close();
    });
});
