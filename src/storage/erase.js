/**
 * Erase everything this app keeps for this origin: the ride/workout database, coaching history,
 * settings, calendar, integration credentials and offline caches. The caller must confirm with the
 * rider first. This is local deletion, not a server request.
 */
import { accountDatabase } from './account.js';
import { openCoachingStorage } from '../coaching/storage.js';

/** Close any open coaching connection before deleting its database. */
async function closeCoachingDatabase() {
    try {
        const storage = await openCoachingStorage(window.indexedDB);
        storage.close();
    } catch {
        // A missing or blocked database still needs to be deleted below.
    }
}

/** Delete one IndexedDB database, resolving even when another tab blocks the request. */
function deleteDatabase(name) {
    return new Promise(resolve => {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
    });
}

/** Delete the app's offline shell cache entries for this origin. */
async function clearCaches() {
    try {
        if(!globalThis.caches) return;
        for(const key of await caches.keys()) await caches.delete(key);
    } catch {
        // Cache deletion is best-effort; site data is what matters most.
    }
}

/**
 * Remove all app data. Local and session storage belong to this standalone origin, so both are
 * cleared completely, including the Intervals.icu API key.
 */
export async function eraseLocalData() {
    await closeCoachingDatabase();
    // Include legacy account-scoped databases as well as the current names.
    const names = new Set([accountDatabase(), 'too-many-watts-coaching']);
    try {
        for(const database of await window.indexedDB.databases?.() ?? []) {
            if(database.name) names.add(database.name);
        }
    } catch {
        // Fall back to the known names when enumeration is unavailable.
    }
    for(const name of names) await deleteDatabase(name);
    window.localStorage.clear();
    window.sessionStorage.clear();
    await clearCaches();
}
