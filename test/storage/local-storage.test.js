/**
 * Checks the small-settings wrapper: save, parse, restore, remove and use an explicit fallback for
 * missing/invalid values. The current suite uses the simulated browser's storage; the older
 * LocalStorageMock below is retained but its assignment is disabled.
 */

/**
 * @jest-environment jsdom
 */

import { LocalStorageItem } from '../../src/storage/local-storage.js';

/**
 * Minimal historical storage stand-in backed by an object. Its familiar
 * clear/getItem/setItem/removeItem methods mirror the interface, not every browser-storage edge
 * case.
 */
class LocalStorageMock {
    constructor() {
        this.store = {};
    }

    clear() {
        this.store = {};
    }

    getItem(key) {
        return this.store[key] || null;
    }

    setItem(key, value) {
        this.store[key] = String(value);
    }

    removeItem(key) {
        delete this.store[key];
    }
}

describe('LocalStorageItem', () => {

    // global.localStorage = new LocalStorageMock();

    global.console = {
        log: jest.fn(),
        error: console.error,
        warn: jest.fn(),
    };

    const ftp = LocalStorageItem({
        key: 'ftp',
        fallback: 200,
        parse: parseInt,
        isValid: (x => x > 20 && x <= 600)
    });

    test('set', async () => {
        let resSet = await ftp.set(250);

        expect(resSet).toStrictEqual(250);
        // expect(resSet).toStrictEqual({key: 'ftp', value: 250});
    });

    test('get', async () => {
        let resGet = await ftp.get();

        expect(resGet).toBe(250);
    });

    test('restore', async () => {
        let resRestore = await ftp.restore();

        expect(resRestore).toStrictEqual(250);
    });

    test('remove', async () => {
        let resRemove = await ftp.remove();

        expect(resRemove).toBe(undefined);

        let resGet = await ftp.get();

        expect(resGet).toBe(200);
    });

    test('get unset value returns fallback', async () => {
        let resGet = await ftp.get();

        expect(resGet).toBe(200);
    });

    test('restore unset value returns fallback', async () => {
        let resRestore = await ftp.restore();

        expect(resRestore).toStrictEqual(200);
    });

    test('set invalid value sets fallback', async () => {
        let resSet = await ftp.set(0);

        expect(resSet).toStrictEqual(200);
        // expect(resSet).toStrictEqual({key: 'ftp', value: 200});
    });
});



// describe('', () => {
//     test('', () => {
//         expect().toBe();
//     });
// });
