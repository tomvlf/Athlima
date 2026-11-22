/** @jest-environment jsdom */
/** Checks the persistence request and the Settings storage summary against a mocked browser API. */
import { requestPersistentStorage, storageStatus } from '../../src/storage/persist.js';

function storage(overrides = {}) {
    Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {persist: async () => true, persisted: async () => true,
            estimate: async () => ({usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024}), ...overrides},
    });
}

test('requests persistent storage without failing when the browser refuses', async () => {
    const persist = jest.fn(async () => false);
    storage({persist});
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, 'storage', {configurable: true, value: {}});
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
});

test('reports persistence, usage and quota', async () => {
    storage();
    expect(await storageStatus()).toEqual({persisted: true, usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024});
});

test('missing or failing storage APIs produce neutral defaults', async () => {
    Object.defineProperty(navigator, 'storage', {configurable: true, value: {
        persisted: async () => { throw new Error('denied'); },
        estimate: async () => { throw new Error('unavailable'); },
    }});
    expect(await storageStatus()).toEqual({persisted: false, usage: null, quota: null});
});
