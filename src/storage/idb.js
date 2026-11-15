/**
 * Wraps IndexedDB, the browser's on-device filing cabinet for larger records such as workouts and
 * FIT files. A store is one collection, and a transaction is a group of reads or writes. Older
 * convenience methods log failures and return an empty result; methods ending in Checked instead
 * report failure to their caller.
 */

//
// IDB
//

import { exists, existance, empty, } from '../functions.js';
import { uuid } from './uuid.js';

/**
 * Turn a browser request with success/error callbacks into a Promise, so callers can wait for its
 * result with await.
 */
function promisify(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
            return resolve(request.result);
        };
        request.onerror = function(event) {
            return reject(request.error);
        };
    });
}

/**
 * Create a database helper with its own open connection. The returned methods share that
 * connection; start must run before reading or writing.
 */
function IDB(args = {}) {
    let db;

    function setDB(idb) {
        db = idb;
    }

    /**
     * Check that a database name was supplied, then open it and create or update its collections
     * when required.
     */
    async function start(database = '', version = 1, stores = []) {
        if(!exists(database)) {
            throw new Error(`:idb idb.start() needs database name!`);
        };
        if(empty(database)) {
            throw new Error(`:idb idb.start() called with empty name!`);
        };
        await open(database, version, stores);
    }

    /**
     * Open the requested database version. The upgrade switch intentionally continues through
     * successive cases so an older database receives every intervening update.
     */
    function open(name, version, storeNames) {
        console.log(`:idb :open :db '${name}' :store-name '${storeNames}' ...`);
        let openReq = window.indexedDB.open(name, version);

        return new Promise((resolve, reject) => {
            openReq.onupgradeneeded = function(e) {
                setDB(openReq.result);
                console.log(`:idb :version ${db.version} :old ${e.oldVersion}`);

                switch(e.oldVersion) {
                // switch(db.version) {
                case 0: createStores(storeNames);
                case 1: update(storeNames);
                case 2: update(storeNames);
                case 3: latest(storeNames);
                }
            };
            openReq.onerror = function() {
                console.error(`:idb :error :open :db '${name}'`, openReq.error);
                return reject(openReq.error);
            };
            openReq.onsuccess = function() {
                setDB(openReq.result);
                console.log(`:idb :version ${db.version}`);
                return resolve(openReq.result);
            };
        });
    }

    function deleteStore(name) {
        let deleteReq = db.deleteObjectStore(name);

        return promisify(deleteReq).then(res => {
            console.log(`:idb :delete-store '${name}'`);
            return res;
        }).catch(err => {
            console.error(`:idb :error :delete-store '${name}'`, err);
            return {};
        });
    }

    /**
     * Create a collection if absent. keyPath identifies the field, usually id, used to distinguish
     * records.
     */
    function createStore(name, keyPath = 'id') {
        if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, {keyPath: keyPath});
            console.log(`:idb :create-store '${name}'`);
        } else {
            console.warn(`:idb :error :createStore 'trying to create store with existing name: ${name}'`);
        }
    }

    /**
     * Create each requested collection, using "id" when no alternative record-key field is
     * supplied.
     */
    function createStores(storeNames, keyPaths = []) {
        storeNames.forEach((storeName, i) => {
            createStore(storeName, existance(keyPaths[i], 'id'));
        });
    }

    /** During a version upgrade, add any requested collections that the older database did not have. */
    async function update(storeNames) {
        console.log(`:idb :update :stores ${storeNames}`);
        // create IndexedDB > db > session, workouts
        await createStores(storeNames);
    }

    function latest(storeNames) {
        console.log(`:idb :latest :stores ${storeNames}`);
    }

    /**
     * Run one named database operation. A missing collection returns undefined; a request failure
     * is logged and returns an empty array. Use the Checked write/delete methods when callers must
     * distinguish failure from success.
     */
    function transaction(storeName, method, param = undefined, type = 'readonly') {
        if(!db.objectStoreNames.contains(storeName)) return undefined;

        let transaction = db.transaction(storeName, type);
        let store = transaction.objectStore(storeName);
        let req;

        if(param === undefined) {
            req = store[method]();
        } else {
            req = store[method](param);
        }

        return promisify(req).then(res => {
            console.log(`:idb :${method} :store '${storeName}' :success`);
            return res;
        }).catch(err => {
            console.error(`:idb :error :${method} :store '${storeName}'`, err);
            return [];
        });
    }

    /**
     * The basic add/put/get/getAll/remove/clear helpers select the operation and read/write mode
     * for transaction. add requires a new key; put also replaces an existing key.
     */
    function add(storeName, item) {
        return transaction(storeName, 'add', item, 'readwrite');
    }

    function put(storeName, item) {
        return transaction(storeName, 'put', item, 'readwrite');
    }

    /**
     * Save one record and resolve with that record only after the whole database write has
     * committed.
     */
    function putChecked(storeName, item) {
        return putManyChecked([[storeName, item]]).then(() => item);
    }

    /**
     * Save related records in one transaction: either every write commits or the transaction is
     * cancelled. Reject on failure so the UI can report that data was not saved.
     */
    function putManyChecked(entries) {
        return new Promise((resolve, reject) => {
            const write = db.transaction([...new Set(entries.map(([name]) => name))], 'readwrite');
            write.oncomplete = () => resolve();
            write.onabort = () => reject(write.error || new Error('Unable to save device data.'));
            write.onerror = () => reject(write.error || new Error('Unable to save device data.'));
            try {
                for(const [name, item] of entries) write.objectStore(name).put(item);
            } catch(error) {
                write.abort();
                reject(error);
            }
        });
    }

    function get(storeName, key) {
        return transaction(storeName, 'get', key, 'readonly');
    }

    function getAll(storeName) {
        return transaction(storeName, 'getAll', undefined, 'readonly');
    }

    function remove(storeName, id) {
        return transaction(storeName, 'delete', id, 'readwrite');
    }

    /**
     * Delete one record and report success only after the deletion commits; reject if the write
     * fails.
     */
    function removeChecked(storeName, id) {
        return new Promise((resolve, reject) => {
            const write = db.transaction(storeName, 'readwrite');
            write.oncomplete = () => resolve();
            write.onabort = () => reject(write.error || new Error('Unable to delete device data.'));
            write.onerror = () => reject(write.error || new Error('Unable to delete device data.'));
            try {
                write.objectStore(storeName).delete(id);
            } catch(error) {
                write.abort();
                reject(error);
            }
        });
    }

    function clear(storeName) {
        return transaction(storeName, 'clear', undefined, 'readwrite');
    }

    /**
     * Keep an existing record ID, otherwise attach the supplied ID or generate a new one. This
     * changes the passed-in record.
     */
    function setId(item, id = undefined) {
        if(!exists(item.id)) {
            if(!exists(id)) {
                id = uuid();
            };
            item.id = id;
            console.log(`:idb :setId`, id);
        }
        return item;
    }

    return Object.freeze({
        start,
        open,
        createStore,
        deleteStore,
        add,
        put,
        putManyChecked,
        putChecked,
        get,
        getAll,
        remove,
        removeChecked,
        clear,
        setId,
    });
}

const idb = IDB();

export { idb };
