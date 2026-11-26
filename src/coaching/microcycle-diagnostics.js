/**
 * Privacy-safe, in-memory diagnostics for Adaptive Microcycle Engine reviews.
 *
 * Events contain only bounded operational metadata and never training notes, workout details,
 * activities, credentials or medical text.
 */

const events = [];
const MAX_EVENTS = 100;

export const MICROCYCLE_ERROR_CODES = Object.freeze({
    stale: 'AME_STALE_REVIEW',
    tamper: 'AME_TAMPER_CHECK_FAILED',
    validation: 'AME_VALIDATION_FAILED',
    storage: 'AME_STORAGE_FAILED',
    candidate: 'AME_CANDIDATE_FAILED',
});

/** Return a snapshot of recent diagnostic events without exposing mutable internal state. */
export function microcycleDiagnostics() {
    return events.map(event => ({...event}));
}

/** Clear in-memory diagnostics; this does not modify coaching state or persisted plans. */
export function clearMicrocycleDiagnostics() {
    events.splice(0, events.length);
}

/**
 * Record a bounded local diagnostic event.
 *
 * @param {object} event - Event fields.
 * @returns {object|null} Cloned event or null when recording is unavailable.
 */
export function recordMicrocycleEvent(event) {
    try {
        if(!event || typeof event.type !== 'string') return null;
        const safe = {
            type: event.type,
            timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
            planRevision: Number.isInteger(event.planRevision) ? event.planRevision : null,
            trigger: typeof event.trigger === 'string' ? event.trigger : null,
            changeCount: Number.isInteger(event.changeCount) ? event.changeCount : null,
            errorCode: typeof event.errorCode === 'string' ? event.errorCode : null,
            plannerVersion: typeof event.plannerVersion === 'string' ? event.plannerVersion : null,
        };
        events.push(safe);
        if(events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
        return {...safe};
    } catch {
        return null;
    }
}
