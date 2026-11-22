/**
 * Creates and restores a downloadable copy of this browser's training data. A backup is a JSON text
 * file; recorded FIT files are converted to text so they fit inside it. Version 2 includes coaching
 * as well as device data. Only listed settings are copied: integration API keys are deliberately
 * excluded.
 */

import { CoachingService } from '../coaching/service.js';
import { openCoachingStorage } from '../coaching/storage.js';

const SETTINGS = ['ftp', 'weight', 'theme', 'dockMode', 'measurement', 'volume', 'dataTileSwitch'];

// Bounds keep a hand-edited or hostile backup from exhausting memory before validation finishes.
const MAX_RECORDS = 10000;
const MAX_ACTIVITY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_ACTIVITY_BYTES = 250 * 1024 * 1024;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Decode one base64 activity recording with format and size checks before allocating the blob. */
function decodeActivity(record) {
    const text = record?.blob;
    if(typeof text !== 'string' || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
        throw new Error('Invalid activity data in local backup.');
    }
    let bytes;
    try { bytes = Uint8Array.from(atob(text), character => character.charCodeAt(0)); }
    catch { throw new Error('Invalid activity data in local backup.'); }
    if(bytes.byteLength > MAX_ACTIVITY_BYTES) throw new Error('An activity in this backup is too large.');
    return bytes;
}

/**
 * Open the existing ride/workout database, refusing to back up an uninitialized or blocked store
 * rather than presenting an empty backup as success.
 */
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(accountDatabase(), 3);
        request.onsuccess = () => {
            const database = request.result;
            if(!['workouts', 'activity'].every(name => database.objectStoreNames.contains(name))) {
                database.close();
                reject(new Error('App data is not ready. Reload before backing up or restoring.'));
            } else resolve(database);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('App storage is blocked by another tab.'));
    });
}

/** Read every item in one database collection and wait for the read operation to finish. */
async function records(database, name) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(name, 'readonly');
        const request = transaction.objectStore(name).getAll();
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error || new Error('Unable to read app data.'));
    });
}

/**
 * Turn binary file bytes into portable text. Small chunks avoid passing a whole recording as
 * thousands of function arguments at once.
 */
function base64(bytes) {
    let text = '';
    for(let offset = 0; offset < bytes.length; offset += 8192) {
        text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(text);
}

/**
 * Gather saved workouts, recordings, calendar, allowed settings and coaching into one version-2
 * backup object. Also keep copies of scheduled built-in workouts so their calendar IDs still
 * resolve after restoration, even if the built-in catalogue changes. The caller downloads the result.
 */
export async function createBackup(library = []) {
    const database = await openDatabase();
    try {
        const [workouts, activityRecords] = await Promise.all([
            records(database, 'workouts'), records(database, 'activity'),
        ]);
        const activities = await Promise.all(activityRecords.map(async record => ({
            ...record, blob: base64(new Uint8Array(await record.blob.arrayBuffer())),
        })));
        const calendar = JSON.parse(accountStorage.getItem('training-calendar') || '[]');
        const planned = JSON.parse(accountStorage.getItem('planned') || '{"workouts":[],"modified":{}}');
        if(!Array.isArray(calendar)) throw new Error('Stored training calendar must be an array.');
        // Retain scheduled copies so their calendar IDs also resolve after a library update.
        for(const entry of calendar) {
            const workout = library.find(w => String(w.id) === entry.workoutId);
            if(workout && !workouts.some(w => w.id === workout.id)) workouts.push(workout);
        }
        const storage = await openCoachingStorage(window.indexedDB);
        let coaching;
        try { coaching = new CoachingService(storage).data; }
        finally { storage.close(); }
        return {version: 2, savedAt: new Date().toISOString(), workouts, activities, coaching,
            settings: Object.fromEntries(SETTINGS.map(key => [key, accountStorage.getItem(key)])),
            calendar, planned};
    } finally { database.close(); }
}

/**
 * Check the backup before saving its contents. Workouts and recordings are added or replaced by ID,
 * while settings/calendar and version-2 coaching are restored from the file. These storage systems
 * cannot be updated as one operation; a later coaching failure is reported explicitly. Version 1
 * has no coaching state.
 */
export async function restoreBackup(backup) {
    if(![1, 2].includes(backup?.version) || !Array.isArray(backup.workouts) || !Array.isArray(backup.activities) ||
       !Array.isArray(backup.calendar) || !isPlainObject(backup.settings) ||
       backup.workouts.length > MAX_RECORDS || backup.activities.length > MAX_RECORDS ||
       backup.calendar.length > MAX_RECORDS ||
       Object.entries(backup.settings).some(([key, value]) => !SETTINGS.includes(key) ||
           (value !== null && typeof value !== 'string')) ||
       backup.workouts.some(w => !w?.id || !isPlainObject(w.meta) || !Array.isArray(w.intervals)) ||
       backup.calendar.some(e => !e?.id || !e.workoutId || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))) {
        throw new Error('Invalid local backup. No data was restored.');
    }
    if(backup.version === 2) {
        if(!backup.coaching || typeof backup.coaching !== 'object') throw new Error('Invalid coaching backup.');
        new CoachingService({getItem: () => JSON.stringify(backup.coaching)});
        if(backup.planned && (!Array.isArray(backup.planned.workouts) ||
            backup.planned.workouts.some(workout => !workout?.id || !isPlainObject(workout.meta) || !Array.isArray(workout.intervals)))) {
            throw new Error('Invalid planned workout backup.');
        }
    }
    let totalBytes = 0;
    const activities = backup.activities.map(record => {
        if(!record?.id || record.summary?.id !== record.id) {
            throw new Error('Invalid activity in local backup.');
        }
        const bytes = decodeActivity(record);
        totalBytes += bytes.byteLength;
        if(totalBytes > MAX_TOTAL_ACTIVITY_BYTES) throw new Error('This backup contains too much activity data.');
        return {...record, blob: new Blob([bytes], {type: 'application/octet-stream'})};
    });
    const database = await openDatabase();
    try {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(['workouts', 'activity'], 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error || new Error('Restore failed.'));
            try {
                for(const workout of backup.workouts) transaction.objectStore('workouts').put(workout);
                for(const activity of activities) transaction.objectStore('activity').put(activity);
            } catch(error) {
                transaction.abort();
                reject(error);
            }
        });
        for(const [key, value] of Object.entries(backup.settings)) {
            if(value === null) accountStorage.removeItem(key);
            else accountStorage.setItem(key, value);
        }
        accountStorage.setItem('training-calendar', JSON.stringify(backup.calendar));
        if(backup.planned) accountStorage.setItem('planned', JSON.stringify(backup.planned));
        if(backup.version === 2) {
            const storage = await openCoachingStorage(window.indexedDB);
            try { await storage.setItem('athlima-coaching-v1', JSON.stringify(backup.coaching)); }
            catch(error) {
                throw new Error(`Files and settings were restored, but coaching could not be restored. Retry: ${error.message}`);
            } finally { storage.close(); }
        }
    } finally { database.close(); }
}
import { accountDatabase, accountStorage } from '../storage/account.js';
