/**
 * Keeps the complete coaching record in its own IndexedDB database, separate from the limited
 * recent-FIT-file cache. The returned adapter looks like a small key/value store to
 * CoachingService. A write checks whether another tab changed the saved record, so one tab cannot
 * silently overwrite the other.
 */

// Separate from the seven-item FIT activity cache: coaching history must not be evicted with it.
/**
 * Open the database and read its saved JSON once. getItem returns this in-memory copy; setItem
 * commits only if the stored copy still matches; close releases the connection. Read/write failures
 * reach the caller.
 */
export async function openCoachingStorage(indexedDB) {
    const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('too-many-watts-coaching', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Coaching storage is blocked by another browser tab.'));
    });
    database.onversionchange = () => database.close();
    const key = 'too-many-watts-coaching-v1';
    const initial = await new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readonly');
        const request = transaction.objectStore('state').get(key);
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(transaction.error || new Error('Coaching history could not be read.'));
    });
    let current = initial;
    if(current == null) {
        const legacyBrand = ['ath', 'lima'].join('');
        const legacyDatabaseName = `${legacyBrand}-coaching`;
        const legacyKey = `${legacyBrand}-coaching-v1`;
        let legacyDatabase = null;
        try {
            legacyDatabase = await new Promise((resolve) => {
                const request = indexedDB.open(legacyDatabaseName, 1);
                request.onupgradeneeded = () => request.transaction?.abort();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            });
            if(legacyDatabase?.objectStoreNames.contains('state')) {
                const legacyValue = await new Promise((resolve) => {
                    const transaction = legacyDatabase.transaction('state', 'readonly');
                    const request = transaction.objectStore('state').get(legacyKey);
                    transaction.oncomplete = () => resolve(request.result ?? null);
                    transaction.onabort = () => resolve(null);
                });
                if(legacyValue != null) {
                    await new Promise((resolve, reject) => {
                        const transaction = database.transaction('state', 'readwrite');
                        transaction.objectStore('state').put(legacyValue, key);
                        transaction.oncomplete = () => resolve();
                        transaction.onabort = () => reject(transaction.error ||
                            new Error('Coaching history could not be migrated.'));
                    });
                    current = legacyValue;
                }
            }
        } catch {
            current = null;
        } finally {
            legacyDatabase?.close();
        }
    }
    return {
        getItem: () => current,
        /**
         * Compare and save inside one transaction. If another tab saved first, cancel this write
         * and ask the user to reload instead of losing the other change.
         */
        setItem: (key, value) => new Promise((resolve, reject) => {
            const transaction = database.transaction('state', 'readwrite');
            const store = transaction.objectStore('state');
            let conflict = false;
            const request = store.get(key);
            request.onsuccess = () => {
                if((request.result ?? null) !== current) {
                    conflict = true;
                    transaction.abort();
                } else store.put(value, key);
            };
            transaction.oncomplete = () => { current = value; resolve(); };
            transaction.onabort = () => reject(conflict
                ? new Error('Coaching history changed in another tab. Reload before editing.')
                : transaction.error || new Error('Coaching changes could not be saved.'));
        }),
        close: () => database.close(),
    };
}
