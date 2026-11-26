/** @jest-environment jsdom */
/**
 * Checks that "delete all local data" removes settings, session credentials, both app databases
 * and offline cache entries without needing a server.
 */
import { IDBFactory } from 'fake-indexeddb';
import { eraseLocalData } from '../../src/storage/erase.js';

let deleted;

beforeEach(async () => {
    Object.defineProperty(window, 'indexedDB', {value: new IDBFactory(), configurable: true});
    localStorage.clear();
    sessionStorage.clear();
    deleted = [];
    Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        value: {
            keys: async () => ['too-many-watts-shell-v1', 'other'],
            delete: async key => { deleted.push(key); return true; },
        },
    });
    await new Promise((resolve, reject) => {
        const request = indexedDB.open('too-many-watts-coaching', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => { request.result.close(); resolve(); };
        request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
        const request = indexedDB.open('store', 3);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('workouts', {keyPath: 'id'});
            request.result.createObjectStore('activity', {keyPath: 'id'});
        };
        request.onsuccess = () => { request.result.close(); resolve(); };
        request.onerror = () => reject(request.error);
    });
});

test('erases settings, credentials, app databases and caches', async () => {
    localStorage.setItem('ftp', '250');
    localStorage.setItem('too-many-watts-intervals-v1', '{"apiKey":"secret"}');
    sessionStorage.setItem('too-many-watts-intervals-v1', '{"apiKey":"secret"}');

    await eraseLocalData();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(deleted).toEqual(expect.arrayContaining(['too-many-watts-shell-v1', 'other']));
    const remaining = await indexedDB.databases?.() ?? [];
    expect(remaining.map(database => database.name)).not.toEqual(expect.arrayContaining(['store', 'too-many-watts-coaching']));
});
