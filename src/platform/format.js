/**
 * Shared presentation helpers for platform pages. They return text or HTML without saving data.
 * Missing measurements use visible placeholders rather than zero; text escaping keeps imported
 * names/descriptions from being interpreted as page instructions.
 */

import { addDays, localDay } from '../coaching/domain.js';
import { html, raw, escapeHTML } from '../html.js';

/**
 * Encode HTML-sensitive characters in plain text; null/undefined become empty text. This is for
 * content insertion, not a URL validator. New markup should interpolate values into `html` instead.
 */
export const escape = escapeHTML;
/**
 * Wrap already-built body HTML in an expandable section. Escape its ID/title; the platform
 * separately controls whether it is open on mobile or desktop.
 */
export const mobileDetails = (id, title, body) => html`<details class="mobile-details" data-mobile-details="${id}" open>
    <summary>${title}</summary><div class="mobile-details-body">${raw(body)}</div></details>`;
export const minutes = seconds => `${Math.round(seconds / 60)} min`;
/**
 * Format a finite number using the reader's locale and requested precision, or show -- for
 * unavailable data.
 */
export const number = (value, digits = 0) => Number.isFinite(value)
    ? value.toLocaleString(undefined, {maximumFractionDigits: digits}) : '--';
/**
 * Show nonnegative total minutes and seconds, not a clock time. Invalid input stays --:-- rather
 * than appearing as a zero-length session.
 */
export const time = seconds => {
    if(!Number.isFinite(seconds)) return '--:--';
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
/**
 * Summarize positive cadence targets as one value or a range. Mention self-selected cadence for
 * steps without a prescribed target.
 */
export function cadenceSummary(steps) {
    const targets = steps.map(step => step.cadence).filter(value => Number.isFinite(value) && value > 0);
    if(!targets.length) return 'Self-selected';
    const min = Math.min(...targets), max = Math.max(...targets);
    const range = min === max ? `${number(min)} rpm` : `${number(min)}–${number(max)} rpm`;
    return targets.length < steps.length ? `${range} / self-selected` : range;
}
/**
 * Find today in the configured athlete time zone, falling back to the browser's zone before a
 * profile exists.
 */
export const today = data => localDay(new Date().toISOString(),
    data?.profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);

/**
 * Collect cycling duration for the last seven days and completion of plan sessions due through
 * today. Future scheduled sessions do not reduce completion percentage; archived plans are
 * excluded.
 */
export function trainingSummary(data, day = today(data)) {
    const rides = (data?.activities || []).filter(a => a.sport === 'cycling' && a.day <= day);
    const week = rides.filter(a => a.day > addDays(day, -7));
    const plan = data?.plan?.status === 'archived' ? null : data?.plan;
    const due = (plan?.workouts || []).filter(w => w.date <= day);
    const completed = due.filter(w => ['completed', 'substituted'].includes(w.status));
    return {
        rides, week, seconds: week.reduce((total, a) => total + a.duration, 0),
        adherence: due.length ? completed.length / due.length : null,
        completed: completed.length, due: due.length,
        upcoming: (plan?.workouts || []).filter(w => w.status === 'scheduled' && w.date >= day),
        days: Array.from({length: 7}, (_, index) => {
            const date = addDays(day, index - 6);
            return {date, seconds: week.filter(a => a.day === date).reduce((total, a) => total + a.duration, 0)};
        }),
    };
}

/**
 * Draw a workout-intensity preview, or an elevation preview for a course without timed steps. These
 * are prescribed/course data, not a graph of measured ride power.
 */
export function profileGraph(workout) {
    const steps = (workout.intervals || []).flatMap(interval => interval.steps || []);
    if(!steps.length) {
        const source = Array.isArray(workout.pointsSimplified) && workout.pointsSimplified.length
            ? workout.pointsSimplified : Array.isArray(workout.points) ? workout.points : [];
        const points = source.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
        if(points.length < 2) return html`<p class="muted">Free ride or course-based workout</p>`;
        const bounds = points.reduce((range, point) => ({
            min: Math.min(range.min, point.y), max: Math.max(range.max, point.y),
        }), {min: points[0].y, max: points[0].y});
        const count = Math.min(points.length, 128);
        const firstX = points[0].x, distance = points[points.length - 1].x - firstX;
        const coordinates = Array.from({length: count}, (_, index) => {
            const point = points[Math.round(index * (points.length - 1) / (count - 1))];
            const x = distance > 0 ? Math.max(0, Math.min(100, (point.x - firstX) / distance * 100)) :
                index * 100 / (count - 1);
            const y = bounds.max === bounds.min ? 24 : 44 - (point.y - bounds.min) / (bounds.max - bounds.min) * 36;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
        return html`<div class="course-profile" role="img" aria-label="Course elevation profile">
            <svg viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="0,48 ${coordinates} 100,48"></polygon><polyline points="${coordinates}"></polyline>
            </svg></div>`;
    }
    const color = power => {
        if(power < .54) return '#636468';
        if(power < .75) return '#328AFF';
        if(power < .87) return '#44A5AB';
        if(power < .94) return '#57C057';
        if(power < 1.05) return '#F8C73A';
        if(power < 1.20) return '#FF663A';
        return '#FE340B';
    };
    const bars = steps.map(step => html`<span style="flex-grow:${Number(step.duration) || 1};
            height:${Math.max(8, Math.min(100, (Number(step.power) || 0) < 9
                ? (Number(step.power) || 0) * 62 : Number(step.power) / 5))}%;
            --bar:${color(Number(step.power) || 0)}"></span>`);
    return html`<div class="profile-graph" role="img" aria-label="Workout target power profile">
        ${bars}</div>`;
}
