/**
 * Ask the browser to keep this origin's training data when storage runs low, and report how much
 * space is in use. Persistence is a request, not a guarantee; a downloaded backup remains the only
 * copy that survives clearing site data.
 */
export async function requestPersistentStorage() {
    try {
        if(navigator.storage?.persist) await navigator.storage.persist();
    } catch {
        // Unsupported or denied persistence does not affect reading or saving training data.
    }
}

/** Return persistence, usage and quota when the browser exposes them. */
export async function storageStatus() {
    const result = {persisted: false, usage: null, quota: null};
    try {
        if(navigator.storage?.persisted) result.persisted = await navigator.storage.persisted();
    } catch {
        // Leave the default when the browser refuses to answer.
    }
    try {
        if(navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            if(Number.isFinite(estimate?.usage)) result.usage = estimate.usage;
            if(Number.isFinite(estimate?.quota)) result.quota = estimate.quota;
        }
    } catch {
        // Leave the defaults when no estimate is available.
    }
    return result;
}
