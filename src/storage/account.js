/**
 * Names the browser storage used by Too Many Watts. A scope is a prefix that keeps one set of saved data
 * separate from another. The browser-only app normally uses an empty prefix; the older account
 * prefixes remain supported here but are not automatically loaded or merged. This is naming, not a
 * login system or access protection.
 */

let scope = '';

/** Choose the prefix for later storage operations; this does not move or erase any existing data. */
export function setAccountScope(email) {
    scope = email ? `too-many-watts:${encodeURIComponent(email)}:` : '';
}

/**
 * The small helpers below apply the current prefix to settings and the ride database. With no
 * prefix, the database is named "store".
 */
export const accountKey = key => `${scope}${key}`;
export const accountDatabase = () => scope ? `${scope}store` : 'store';
export const hasAccountScope = () => Boolean(scope);
/**
 * Use the same naming rule for reading, writing and removing browser settings. Values are stored as
 * text, not encrypted.
 */
export const accountStorage = {
    getItem: key => window.localStorage.getItem(accountKey(key)),
    setItem: (key, value) => window.localStorage.setItem(accountKey(key), value),
    removeItem: key => window.localStorage.removeItem(accountKey(key)),
};
