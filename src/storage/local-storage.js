/**
 * Stores one small browser setting, such as FTP or a theme choice. localStorage keeps text across
 * reloads; parse converts that text back into a useful value and encode converts it for saving.
 * Each setting provides its own validation and fallback value. This is local persistence, not cloud
 * synchronization.
 */

//
// LocalStorageItem
//

import { equals, exists, existance } from '../functions.js';
import { accountStorage } from './account.js';

/**
 * Build the read/write helpers for one named setting. A missing key is a programming error;
 * optional conversion and checking functions customize the value format.
 */
function LocalStorageItem(args = {}) {
    const defaults = {
        fallback: '',
        isValid:  function (v) { return exists(v); },
        parse:    function(str) { return str; },
        encode:   function(str) { return str; },
    };

    let key      = args.key;
    let fallback = existance(args.fallback, defaults.fallback);
    let isValid  = existance(args.isValid, defaults.isValid);
    let parse    = existance(args.parse, defaults.parse);
    let encode   = existance(args.encode, defaults.encode);

    if(!exists(key)) throw new Error('LocalStorageItem needs a key!');

    /**
     * Read the setting and write its fallback into storage when that is the restored value, then
     * return the saved value.
     */
    function restore() {
        const inStorageValue = get();

        if(equals(inStorageValue, fallback)) {
            set(fallback);
        }

        return get();
    }

    /** Read and parse the saved text, or log that it is missing and return the configured fallback. */
    function get() {
        const value = accountStorage.getItem(`${key}`);

        if(!exists(value)) {
            console.warn(`Trying to get non-existing value from Local Storage at key ${key}!`);
            return fallback;
        }

        return parse(value);
    }

    /**
     * Save an accepted value through its encoder. Invalid input is logged and replaced with the
     * fallback rather than saved unchanged.
     */
    function set(value) {
        if(isValid(value)) {
            accountStorage.setItem(`${key}`, encode(value));
            return value;
        } else {
            console.warn(`Trying to enter invalid ${key} value in Local Storage: ${typeof value}`, value);
            accountStorage.setItem(`${key}`, fallback);
            return fallback;
        }
    }

    function remove() {
        accountStorage.removeItem(`${key}`);
    }

    return Object.freeze({
        restore,
        get,
        set,
        remove,
    });
}

export { LocalStorageItem };
