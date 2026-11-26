/** Tests privacy-safe local AME diagnostics and stable error codes. */

import {
    MICROCYCLE_ERROR_CODES,
    clearMicrocycleDiagnostics,
    microcycleDiagnostics,
    recordMicrocycleEvent,
} from '../../src/coaching/microcycle-diagnostics.js';

test('records bounded operational events without sensitive fields', () => {
    clearMicrocycleDiagnostics();
    recordMicrocycleEvent({
        type: 'review_built',
        timestamp: '2026-01-01T10:00:00Z',
        planRevision: 2,
        trigger: 'evidence',
        changeCount: 3,
        plannerVersion: 'too-many-watts-coach',
        notes: 'private text',
        apiKey: 'secret',
    });
    const events = microcycleDiagnostics();
    expect(events).toEqual([{
        type: 'review_built',
        timestamp: '2026-01-01T10:00:00Z',
        planRevision: 2,
        trigger: 'evidence',
        changeCount: 3,
        errorCode: null,
        plannerVersion: 'too-many-watts-coach',
    }]);
    expect(JSON.stringify(events)).not.toMatch(/private text|secret|apiKey|notes/);
    events[0].type = 'changed';
    expect(microcycleDiagnostics()[0].type).toBe('review_built');
});

test('uses stable error codes and logging failure cannot break the caller', () => {
    clearMicrocycleDiagnostics();
    expect(recordMicrocycleEvent({
        type: 'stale_review_rejected',
        timestamp: '2026-01-01T10:00:00Z',
        planRevision: 2,
        errorCode: MICROCYCLE_ERROR_CODES.stale,
    }).errorCode).toBe('AME_STALE_REVIEW');
    expect(recordMicrocycleEvent(null)).toBeNull();
});
