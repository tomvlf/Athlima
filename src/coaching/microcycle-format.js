/**
 * Central fallback-safe presentation and formatting helpers for Adaptive Microcycle Engine text.
 * There is no existing i18n framework in Too Many Watts, so this module intentionally remains local and
 * does not introduce a second framework.
 */

const messages = Object.freeze({
    coachReview: 'Coach review',
    reviewNextSeven: 'Review next 7 days',
    today: 'Today',
    proposedUpdate: 'Proposed week update',
    reviewRecommended: 'Coach review recommended',
    acceptUpdate: 'Accept update',
    dismiss: 'Dismiss',
    noChanges: 'The review found no session changes.',
    temporaryAvailability: 'Temporary availability',
    addAnotherDay: 'Add another day',
    removeDay: 'Remove day',
    date: 'Date',
    availability: 'Availability',
    available: 'Available',
    unavailable: 'Unavailable',
    maximumMinutes: 'Maximum minutes',
    environment: 'Environment',
    indoor: 'Indoor',
    outdoor: 'Outdoor',
    either: 'Either',
    dayNote: 'Day note',
    generalNote: 'General context note',
    reviewBeforeTraining: 'Review before training',
    forecastTitle: 'Seven-day plan comparison',
    currentPlan: 'Current',
    candidatePlan: 'Candidate',
});

/** Return an AME message with a safe English fallback. */
export function microcycleMessage(key) {
    return messages[key] ?? '';
}

/** Format an ISO date using the browser locale and an explicit safe fallback. */
export function formatMicrocycleDate(value, locale = undefined, timeZone = undefined) {
    if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Unknown date';
    const parsed = new Date(`${value}T12:00:00Z`);
    if(!Number.isFinite(parsed.getTime())) return 'Unknown date';
    if(parsed.toISOString().slice(0, 10) !== value) return 'Unknown date';
    try { return new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeZone}).format(parsed); }
    catch { return value; }
}

/** Format an ISO timestamp using the browser locale and a safe fallback. */
export function formatMicrocycleTimestamp(value, locale = undefined, timeZone = undefined) {
    const parsed = new Date(value);
    if(!Number.isFinite(parsed.getTime())) return 'Unknown time';
    try { return new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short', timeZone}).format(parsed); }
    catch { return String(value); }
}

/** Format whole or fractional numbers with locale-aware separators. */
export function formatMicrocycleNumber(value, digits = 0, locale = undefined) {
    return Number.isFinite(value)
        ? new Intl.NumberFormat(locale, {maximumFractionDigits: digits}).format(value)
        : '—';
}

/** Format seconds as locale-aware whole minutes. */
export function formatMicrocycleMinutes(seconds, locale = undefined) {
    return `${formatMicrocycleNumber(Math.round((seconds || 0) / 60), 0, locale)} min`;
}
